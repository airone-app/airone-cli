/**
 *
 * Airone cli 工具
 *
 * 命令行选项功能基于 Commander-js, 详情 => https://github.com/tj/commander.js/blob/master/Readme_zh-CN.md
 * 命令行交互功能基于 Inquirer.js, 详情 => https://github.com/SBoudrias/Inquirer.js, 示例文档：=> https://blog.csdn.net/qq_26733915/article/details/80461257
 */

// sys
import fs from 'fs'
import path from 'path'
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
// 3rd
import { Command } from 'commander'
import * as shelljs from 'shelljs'
import OraJS from 'ora'
import * as inquirer from 'inquirer'
import pkg from '../package.json'
// framework
import { DateUtil, StringUtil, ArrayUtil, SystemUtil } from './base'


//#region [define]   全局定义

// 全局变量
const USER_HOME = process.env.HOME || process.env.USERPROFILE || '~'
const GLOBAL_DIR_NAME = '.' + pkg.name
const GLOBAL_DIR = path.join(USER_HOME, GLOBAL_DIR_NAME)
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_DIR, 'config.json')
const GLOBAL_REPOSITORY_DIR = path.join(GLOBAL_DIR, 'repository')
const GLOBAL_REPOSITORY_PACKAGE = path.join(GLOBAL_REPOSITORY_DIR, 'package.json')
var PROJECT_DIR = shelljs.pwd().toString()
const PROJECT_CONFIG_NAME = 'airone.json'
var PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, PROJECT_CONFIG_NAME)
const ERROR_MSG = `${pkg.name} 更新Failure，请重试或手动更新`;
var BranchName: string | null = null

// 新建 program 对象，全局命令行对象
const program = new Command(pkg.name + ' branch')
const spinner = OraJS()

// ---- 项目配置文件框架
interface AironeModule {
  name: string,
  git: string,
  version?: string,
  branch?: string,
  tag?: string
}

interface AironeConfig {
  /** 项目名 */
  name: string

  /** 项目描述 */
  desc?: string

  /** 项目版本号 */
  version: string

  /** 依赖模块（非源码） */
  modules: AironeModule[]

  /** 依赖模块（源码模块） */
  devModules: AironeModule[]
}

// ---- 接口、类型定义
interface Config {
  version: string // 版本号
  lastUpdate?: string // 上次更新日期
  // [propName: string]: any
}


//#region [main]     命令行基本信息

// 版本信息
program.addHelpText('before', `
Airone Branch Command:

  基于当前分支创建新分支，或重命名当前分支。

  用法示例:
    $ airone branch new_feature         # 创建名为 new_feature 的新分支
    $ airone branch -r hotfix_branch    # 将当前分支重命名为 hotfix_branch

  操作流程:
  1. 询问用户确认操作。
  2. 检查主工程和各子模块是否有未提交的更改。
  3. 更新主工程和各子模块的当前分支代码。
  4. 对主工程执行分支创建/重命名操作。
  5. 对符合条件的子模块 (配置了 branch 且与主工程当前分支一致) 执行分支创建/重命名操作。
  6. 更新 airone.json 中子模块的 branch 配置 (如果是重命名或创建成功)。
`);

program
  .arguments('[branch]')
  .option('-r, --rename <branch>', 'rename to a new branch')
  .action((branch, options) => {
    BranchName = options.rename ?? branch
  });

//#region [scaffold] 脚手架方法

/** 读配置文件（如果不给地址，配置文件将默认存储在系统用户根目录） */
const loadConfig = (configPath?: string): Config | null => {
  let config = {
    version: pkg.version,
    lastUpdate: DateUtil.currentDateStringWithFormat("yyyy-M-d")
  }

  if (configPath == undefined) {
    configPath = GLOBAL_CONFIG_PATH;
    // 配置路径不存在则新建之
    if (!fs.existsSync(GLOBAL_DIR)) {
      console.log('Create project global config dir => ', GLOBAL_DIR);
      fs.mkdirSync(GLOBAL_DIR)
    }
  } else if (!fs.existsSync(configPath)) {
    return null;
  }

  // 配置文件不存在则新建之
  if (!fs.existsSync(configPath)) {
    saveConfig(config)
  } else {
    const configBuff = fs.readFileSync(configPath);
    const configContent = configBuff && configBuff.toString()
    if (!StringUtil.isEmpty(configContent)) {
      config = JSON.parse(configContent);
    }
  }

  return config
}

/** 本地保存配置文件（如果不给地址，配置文件将默认存储在系统用户根目录） */
const saveConfig = (config: Config, configPath?: string): void => {
  if (configPath == undefined) {
    configPath = GLOBAL_CONFIG_PATH;
    // 配置路径不存在则新建之
    if (!fs.existsSync(GLOBAL_DIR)) {
      console.log('Create project global config dir => ', GLOBAL_DIR);
      fs.mkdirSync(GLOBAL_DIR)
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, "\t"))
}

//#endregion


//#region [main]  checkout modules
const outputOverAll: string[] = []
async function execCmd(dirPath: string, mainProjectCurrentBranch: string) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return;
  }

  var lsResult: string[] = fs.readdirSync(dirPath);
  const projectConfig: AironeConfig = loadConfig(PROJECT_CONFIG_PATH) as AironeConfig
  const options = program.opts();

  outputOverAll.splice(0, outputOverAll.length);
  outputOverAll.push('\n\n')
  outputOverAll.push('------------- 结果汇总 ------------')
  for (let index = 0; index < lsResult.length; index++) {
    const element = lsResult[index];
    const elementPath = path.join(dirPath, element)
    if (fs.statSync(elementPath).isDirectory()) {
      if (!fs.existsSync(path.join(elementPath, './.git'))) {
        continue;
      }
      shelljs.cd(elementPath)

      // 取之 airModule
      let airModule: AironeModule | null = null
      for (const module of projectConfig.devModules) {
        if (module.name == element) {
          airModule = module
          break;
        }
      }

      if (airModule?.branch && airModule.branch !== mainProjectCurrentBranch) {
        const msg = `* ${element}: 配置的分支 (${airModule.branch}) 与主项目当前分支 (${mainProjectCurrentBranch}) 不符，跳过操作。`;
        outputOverAll.push(msg);
        shelljs.echo(msg);
        shelljs.cd('..');
        continue;
      }

      if (airModule?.tag) {
         shelljs.echo(`* ${element}: 配置为 tag (${airModule.tag})，跳过分支操作。`);
         shelljs.cd('..');
         continue;
      }

      // 1. 先检查此目录是否有修改
      if (!checkProjModify(elementPath)) { // 有修改
        const msg = `X ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 下有改动还未提交，请先提交之.`
        outputOverAll.push(msg)
        shelljs.echo(msg)
      }
      // 2. 切换分支 (如果 airModule.branch 存在且与主分支相同，这一步会成功；如果 airModule.branch 不存在，checkProjBranchAndTag 会返回 true)
      else if (!checkProjBranchAndTag(elementPath, element, projectConfig.devModules)) { // 切换分支报错
        const msg = `X ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 切分支报错 (${airModule?.branch})，请自行检查 `
        outputOverAll.push(msg)
        shelljs.echo(msg)
      }
      // 3. 更新当前目录
      else if (!checkProjPull(elementPath)) { // 更新失败
        const msg = `X ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 下更新代码Failure, 请自行检查网络等原因或手动更新.`
        outputOverAll.push(msg)
        shelljs.echo(msg)
      }
      else { // 前置检查通过，执行分支创建或重命名
        if (options && options.rename) {
          if (!renameBranch(elementPath, element, projectConfig.devModules)) {
            const msg = `X ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 重命名分支报错，请自行检查 `
            outputOverAll.push(msg)
          } else {
             outputOverAll.push(`√ ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 重命名分支 Success！`)
          }
        }
        else {
          if (!makeBranch(elementPath, element, projectConfig.devModules)) {
            const msg = `X ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 创建分支报错，请自行检查 `
            outputOverAll.push(msg)
          } else {
             outputOverAll.push(`√ ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 创建分支 Success！`)
          }
        }
      }

      // 即出目录
      shelljs.cd('..')
    }
  }

  shelljs.echo(outputOverAll.join('\n'))
  saveConfig(projectConfig, PROJECT_CONFIG_PATH)
}

function checkProjBranchAndTag(checkPath: string, element: string, modules: AironeModule[]): boolean {
  shelljs.echo('-n', `* 检查分支： ${checkPath.substring(checkPath.lastIndexOf('/') + 1)}...`)

  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  // 取之 airModule
  let airModule: AironeModule | null = null
  for (const module of modules) {
    if (module.name == element) {
      airModule = module
      break;
    }
  }

  if (airModule && airModule.branch) {
    const result = shelljs.exec('git checkout ' + airModule.branch, { silent: true })
    if (result.code == 0) {
      shelljs.echo('Checkout branch:' + airModule.branch + ' - Success!')
      return true
    } else {
      shelljs.echo('Checkout branch:' + airModule.branch + ' - Failure!')
      return false;
    }
  }
  else if (airModule && airModule.tag) {
    const result = shelljs.exec(`git checkout ${airModule.tag}`, { silent: true })
    if (result.code == 0) {
      shelljs.echo('Checkout tag:' + airModule.tag + ' - Success!')
      return true
    } else { // 建 Tag Failure，则
      shelljs.echo('Checkout tag:' + airModule.tag + ' - Failure!')
      return false;
    }
  }

  return true;
}

function makeBranch(checkPath: string, element: string, modules: AironeModule[]): boolean {
  shelljs.echo(`* 操作分支： ${checkPath.substring(checkPath.lastIndexOf('/') + 1)}...`)

  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  // 取之 airModule
  let airModule: AironeModule | null = null
  for (const module of modules) {
    if (module.name == element) {
      airModule = module
      break
    }
  }

  if (airModule && airModule.branch && BranchName) {
    // 使用 && 链式执行 git 命令
    const result = shelljs.exec(`git branch ${BranchName} && git push origin -u ${BranchName}`, { fatal: true })
    if (result.code == 0) {
      airModule.branch = BranchName
      return true
    } else {
      return false
    }
  }

  return false
}

function renameBranch(checkPath: string, element: string, modules: AironeModule[]): boolean {
  shelljs.echo(`* 操作分支： ${checkPath.substring(checkPath.lastIndexOf('/') + 1)}...`)

  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  // 取之 airModule
  let airModule: AironeModule | null = null
  for (const module of modules) {
    if (module.name == element) {
      airModule = module
      break
    }
  }

  if (airModule && airModule.branch && BranchName) {
    const oldBranch = airModule.branch
    // 使用 && 链式执行 git 命令
    const result = shelljs.exec(`git branch -m ${oldBranch} ${BranchName} && git push origin -d ${oldBranch} && git push origin -u ${BranchName}`, { fatal: true })
    if (result.code == 0) {
      airModule.branch = BranchName
      return true
    } else {
      return false
    }
  }

  return false
}

function checkProjModify(checkPath: string): boolean {
  shelljs.echo('-------------------------')
  shelljs.echo('-n', `* 检查目录： ${checkPath.substring(checkPath.lastIndexOf('/') + 1)} 是否有改动未提交...`)

  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  const result = shelljs.exec('git status -s', { silent: true })
  if (result.code != 0 || result.toString().length > 0) {
    return false;
  }

  shelljs.echo(`clean ！`)
  return true;
}

function checkProjPull(checkPath: string): boolean {
  shelljs.echo('-n', `* 正在更新目录： ${checkPath.substring(checkPath.lastIndexOf('/') + 1)}...`)

  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  const result = shelljs.exec('git pull --rebase', { fatal: true })
  if (result.code != 0) {
    shelljs.echo(` git 更新Failure，请检查命令当前网络环境`)
    return false
  } else {
    shelljs.echo(` 更新Success ！`)
    return true
  }

  return false;
}
//#endregion


//#region [interface]  命令行定义及处理参数

program.parse(process.argv)

//#endregion


// 先添加 async 函数，确认用户操作
async function confirmOperation(branchName: string, isRename: boolean): Promise<boolean> {
  let confirmMessage = '';
  // 获取当前分支
  const currentBranchResult = shelljs.exec('git symbolic-ref --short HEAD', { silent: true });
  const currentBranch = currentBranchResult.stdout.trim();
  
  if (isRename && currentBranch) {
    confirmMessage = `您将要把分支 "${currentBranch}" 重命名为 "${branchName}"，是否继续？`;
  } else {
    confirmMessage = `您将要从分支 "${currentBranch}" 创建新分支 "${branchName}"，是否继续？`;
  }
  
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'continue',
      message: confirmMessage,
      default: false
    }
  ]);
  
  return answer.continue;
}

// 处理主工程创建/重命名分支，返回操作是否成功
async function handleMainProject(currentBranch: string): Promise<boolean> {
  shelljs.echo('处理主工程分支...');

  // 切换到主工程目录 (这个切换是必要的，因为后续 git 命令需要在主工程目录下执行)
  const originalDir = shelljs.pwd().toString(); // 保存原始目录
  shelljs.cd(PROJECT_DIR);

  // 检查是否有未提交的修改
  if (!checkProjModify(PROJECT_DIR)) {
    shelljs.echo('主工程有未提交的修改，请先提交');
    shelljs.cd(originalDir); // 返回原目录
    return false;
  }

  // 拉取最新代码
  if (!checkProjPull(PROJECT_DIR)) {
    shelljs.echo('主工程拉取最新代码失败');
    shelljs.cd(originalDir); // 返回原目录
    return false;
  }

  const options = program.opts();
  let result = false;

  // 根据操作类型执行相应的分支操作
  if (options && options.rename) {
    shelljs.echo(`正在重命名主工程分支 ${currentBranch} 为 ${BranchName}...`);
    // 执行重命名操作 - 使用 && 链式执行
    const renameResult = shelljs.exec(`git branch -m ${currentBranch} ${BranchName} && git push origin -d ${currentBranch} && git push origin -u ${BranchName}`, { fatal: true });
    result = renameResult.code === 0;
  } else {
    shelljs.echo(`正在基于当前分支 ${currentBranch} 创建主工程分支 ${BranchName}...`);
    // 执行创建操作 - 使用 && 链式执行
    const createResult = shelljs.exec(`git branch ${BranchName} && git checkout ${BranchName} && git push origin -u ${BranchName}`, { fatal: true });
    result = createResult.code === 0;
  }

  // 返回原目录
  shelljs.cd(originalDir);

  // 返回操作结果
  return result;
}

async function main() {
  if (StringUtil.isEmpty(BranchName)) {
    console.log('请指定分支名')
    shelljs.exit(-1)
  }

  // 目录自动搜索
  console.log(`解析项目配置文件 ${PROJECT_CONFIG_PATH}`);
  if (!fs.existsSync(PROJECT_CONFIG_PATH)) {
    PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, '../' + PROJECT_CONFIG_NAME);
    console.log(`解析项目配置文件 ${PROJECT_CONFIG_PATH}`);
    if (!fs.existsSync(PROJECT_CONFIG_PATH)) {
      console.log(`项目配置文件 ${PROJECT_CONFIG_NAME} 不存在，请确认当前是否在 ${pkg.name} 项目根目录。`);
      shelljs.exit(-1)
    }
  }
  PROJECT_DIR = path.dirname(PROJECT_CONFIG_PATH); // 使用 dirname 获取目录

  // ---- 新增：获取主工程当前分支 ----
  let mainProjectCurrentBranch = '';
  const currentDir = shelljs.pwd().toString();
  shelljs.cd(PROJECT_DIR);
  const mainBranchResult = shelljs.exec('git symbolic-ref --short HEAD', { silent: true });
  if (mainBranchResult.code === 0) {
    mainProjectCurrentBranch = mainBranchResult.stdout.trim();
    shelljs.echo(`检测到主工程当前分支为: ${mainProjectCurrentBranch}`);
  } else {
    shelljs.echo('无法获取主工程当前分支，请确保在 Git 仓库目录下运行。');
    shelljs.cd(currentDir); // 切回原目录
    shelljs.exit(-1);
  }
  shelljs.cd(currentDir); // 切回原目录
  // ---- 结束获取主工程当前分支 ----

  const options = program.opts();
  const isRename = options && options.rename ? true : false;

  // 先获取确认
  const confirmed = await confirmOperation(BranchName!, isRename); // confirmOperation 内部会获取当前分支用于提示，这里保持不变
  if (!confirmed) {
    shelljs.echo('操作已取消');
    shelljs.exit(0);
  }

  // 首先处理主工程
  const mainProjectSuccess = await handleMainProject(mainProjectCurrentBranch); // 传递获取到的分支名
  // 如果主工程操作失败，直接退出程序
  if (!mainProjectSuccess) {
    shelljs.echo('主工程操作失败');
    shelljs.exit(-1);
  } else {
    shelljs.echo('主工程操作成功');
  }

  // 然后处理子模块
  let devModulesDir = path.join(PROJECT_DIR, 'devModules')
  await execCmd(devModulesDir, mainProjectCurrentBranch) // 传递主工程分支名
}

main()