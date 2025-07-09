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

// 项目配置全局变量
var projectConfig: AironeConfig | null = null

// 新建 program 对象，全局命令行对象
const program = new Command(pkg.name + ' release')
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
Airone Release Command:

  将主工程和子模块的 *当前* (或指定) 分支合并到各自的 'master' 分支。

  用法示例:
    $ airone release          # 将主工程和子模块的 *当前* 分支合并到 master
    $ airone release feature_branch # 将主工程和子模块的 feature_branch 分支合并到 master

  操作流程:
  1. 询问用户确认操作。
  2. 处理主工程：
     a. 检查是否有未提交的更改。
     b. 切换到 'master' 分支并拉取最新代码。
     c. 合并指定 (或当前) 分支到 'master'。
     d. 推送 'master' 分支。
  3. 如果主工程合并失败，则终止操作。
  4. 处理 devModules 子模块 (跳过配置为 'tag' 的模块)：
     a. 检查是否有未提交的更改。
     b. 切换到 'master' 分支并拉取最新代码。
     c. 合并 airone.json 中记录的该模块的开发分支到 'master'。
     d. 基于开发分支名创建 Tag (例如: 'dev_v1.2.3' -> Tag 'v1.2.3')。
     e. 推送 'master' 分支和新创建的 Tag。
     f. 更新 airone.json，将该模块的 'branch' 配置移除，添加 'tag' 配置。
`);


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

/** 获取项目配置（全局缓存） */
const getProjectConfig = (): AironeConfig => {
  if (projectConfig === null) {
    projectConfig = loadConfig(PROJECT_CONFIG_PATH) as AironeConfig
  }
  return projectConfig
}

/** 保存项目配置并更新全局缓存 */
const saveProjectConfig = (config: AironeConfig): void => {
  projectConfig = config
  saveConfig(config, PROJECT_CONFIG_PATH)
}

//#region [main]  checkout modules
const outputOverAll: string[] = []
async function releaseModules(dirPath: string): Promise<boolean> {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return true; // 如果目录不存在，认为是成功的（没有子模块需要处理）
  }

  var lsResult: string[] = fs.readdirSync(dirPath);
  const config = getProjectConfig()

  outputOverAll.splice(0, outputOverAll.length);
  outputOverAll.push('\n\n')
  outputOverAll.push('------------- 结果汇总 ------------')
  let allSuccess = true; // 记录是否全部成功
  
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
      for (const module of config.devModules) {
        if (module.name == element) {
          airModule = module
          break;
        }
      }

      if (airModule == null || airModule?.tag) {
        shelljs.echo(`√ ${airModule?.name} Already Update`)
        shelljs.cd('..')
        continue
      }

      // 1. 先检查此目录是否有修改
      if (!checkProjModify(elementPath)) { // 有修改
        const msg = `X ${airModule?.name} 下有改动还未提交，请先提交之.`
        outputOverAll.push(msg)
        shelljs.echo(msg)
        allSuccess = false
      }
      // 2. 更新master分支
      else if (!updateMaster(airModule)) {
        const msg = `X ${airModule?.name} 更新master分支报错，请自行检查 `
        outputOverAll.push(msg)
        shelljs.echo(msg)
        allSuccess = false
      }
      else if (!mergeToMaster(airModule)) {
        const msg = `X ${airModule?.name} 合并到master报错，请自行检查 `
        outputOverAll.push(msg)
        shelljs.echo(msg)
        allSuccess = false
      }
      else {
        outputOverAll.push(`√ ${airModule?.name} Success！`)
      }

      // 即出目录
      shelljs.cd('..')
    }
  }

  shelljs.echo(outputOverAll.join('\n')) 
  saveProjectConfig(config)
  return allSuccess
}

function checkProjModify(checkPath: string): boolean {
  shelljs.echo('-n', `* 检查目录： ${checkPath.substring(checkPath.lastIndexOf('/') + 1)} 是否有改动未提交...`)

  const result = shelljs.exec('git status -s', { silent: true })
  if (result.code != 0 || result.toString().length > 0) {
    shelljs.echo(`dirty ！`)
    return false;
  }

  shelljs.echo(`clean ！`)
  return true;
}

function updateMaster(airModule: AironeModule | null): boolean {
  shelljs.echo('-n', `* update master： ${airModule?.name}...`)

  if (airModule && airModule.branch) {
    const result = shelljs.exec(`git checkout master && git fetch origin && git pull -r origin`, { silent: true })
    if (result.code == 0) {
      shelljs.echo('Success!')
      return true
    }
  }

  shelljs.echo('Failure!')
  return false
}

function mergeToMaster(airModule: AironeModule | null): boolean {
  shelljs.echo(`* 合并到master： ${airModule?.name}...`)

  if (airModule && airModule.branch) {
    const tagName = airModule.branch.split('_')[1]
    const result = shelljs.exec(`git merge origin/${airModule.branch} && git tag ${tagName} && git push origin master ${tagName}`, { fatal: true })
    if (result.code == 0) {
      airModule.branch = undefined
      airModule.tag = tagName
      
      // 同步修改配置文件的版本号
      const config = getProjectConfig()
      config.version = tagName
      
      return true
    }
  }

  return false
}

//#endregion


//#region [interface]  命令行定义及处理参数

program
  .arguments('[branch]')
  .action(async (branch) => {
    await main(branch);
  });

//#endregion


async function mergeMainProject(branchName?: string): Promise<boolean> {
  // 检查主工程是否有未提交的更改
  if (!checkProjModify(PROJECT_DIR)) {
    shelljs.echo('主工程有未提交的更改，请先处理。');
    return false;
  }

  // 如果未指定分支，获取当前分支
  if (!branchName) {
    const currentBranchResult = shelljs.exec('git symbolic-ref --short HEAD', { silent: true });
    if (currentBranchResult.code !== 0) {
      shelljs.echo('获取当前分支失败！');
      return false;
    }
    branchName = currentBranchResult.stdout.trim();
  }

  // 如果当前已经是master分支，提示并退出
  if (branchName === 'master') {
    shelljs.echo('当前已经在master分支，无需合并！');
    return false;
  }

  shelljs.echo(`* 正在合并分支 ${branchName} 到 master...`);

  // 切换到主工程目录
  const currentDir = shelljs.pwd().toString();
  shelljs.cd(PROJECT_DIR);

  // 更新 master 分支
  const updateResult = shelljs.exec('git checkout master && git fetch origin && git pull -r origin master', { silent: false });
  if (updateResult.code !== 0) {
    shelljs.echo('更新主工程 master 分支失败！');
    shelljs.cd(currentDir);
    return false;
  }

  // 合并指定分支到 master
  const mergeResult = shelljs.exec(`git merge origin/${branchName}`, { silent: false });
  if (mergeResult.code !== 0) {
    shelljs.echo(`合并主工程分支 ${branchName} 到 master 失败！请手动解决冲突。`);
    shelljs.cd(currentDir);
    return false;
  }

  // 推送 master 分支到远程仓库
  shelljs.echo(`* 推送主工程 master 分支到远程仓库...`);
  const pushResult = shelljs.exec('git push origin master', { silent: false });
  if (pushResult.code !== 0) {
    shelljs.echo('推送主工程 master 分支到远程仓库失败！');
    shelljs.cd(currentDir);
    return false;
  }

  shelljs.echo(`主工程分支 ${branchName} 已成功合并到 master！`);
  shelljs.cd(currentDir);
  return true;
}

/** 提交主工程配置文件修改并打tag */
async function commitAndTagMainProject(): Promise<boolean> {
  shelljs.echo('* 子模块全部合并成功，正在检查主工程配置文件修改...')
  
  // 切换到主工程目录
  const currentDir = shelljs.pwd().toString()
  shelljs.cd(PROJECT_DIR)
  
  // 检查是否有配置文件修改
  const statusResult = shelljs.exec('git status --porcelain airone.json', { silent: true })
  if (statusResult.code !== 0 || statusResult.stdout.trim() === '') {
    shelljs.echo('没有配置文件修改需要提交')
    shelljs.cd(currentDir)
    return true
  }
  
  // 检查是否只有配置文件修改
  const allStatusResult = shelljs.exec('git status --porcelain', { silent: true })
  if (allStatusResult.code !== 0) {
    shelljs.echo('检查工作区状态失败！')
    shelljs.cd(currentDir)
    return false
  }
  
  const allChanges = allStatusResult.stdout.trim().split('\n').filter(line => line.trim() !== '')
  const configFileChanges = allChanges.filter(line => line.includes('airone.json'))
  
  if (allChanges.length > configFileChanges.length) {
    shelljs.echo('工作区存在除配置文件外的其他修改，跳过自动提交和打tag操作')
    shelljs.echo('请手动处理其他修改后再进行提交和打tag')
    shelljs.cd(currentDir)
    return true
  }
  
  shelljs.echo('* 仅有配置文件修改，正在提交主工程配置文件修改...')
  
  // 提交配置文件修改
  const commitResult = shelljs.exec('git add airone.json && git commit -m "config: update airone"', { silent: false })
  if (commitResult.code !== 0) {
    shelljs.echo('提交配置文件修改失败！')
    shelljs.cd(currentDir)
    return false
  }
  
  // 读取项目配置获取版本号
  const config = getProjectConfig()
  const tagName = config.version
  
  // 创建tag
  shelljs.echo(`* 正在为主工程创建tag: ${tagName}...`)
  const tagResult = shelljs.exec(`git tag ${tagName}`, { silent: false })
  if (tagResult.code !== 0) {
    shelljs.echo(`创建tag ${tagName} 失败！可能tag已存在。`)
    shelljs.cd(currentDir)
    return false
  }
  
  // 推送到远端
  shelljs.echo(`* 正在推送主工程修改和tag到远端...`)
  const pushResult = shelljs.exec(`git push origin master ${tagName}`, { silent: false })
  if (pushResult.code !== 0) {
    shelljs.echo('推送主工程修改和tag到远端失败！')
    shelljs.cd(currentDir)
    return false
  }
  
  shelljs.echo(`主工程配置文件已提交，tag ${tagName} 已创建并推送到远端！`)
  shelljs.cd(currentDir)
  return true
}

async function main(branchName?: string) {
  // 检查是否安装git
  if (!shelljs.which('git')) {
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之。');
    shelljs.exit(-1);
  }

  // 目录自动搜索
 console.log(`解析项目配置文件 ${PROJECT_CONFIG_PATH}`);
 if (!fs.existsSync(PROJECT_CONFIG_PATH)) {
   PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, '../' + PROJECT_CONFIG_NAME);
   console.log(`解析项目配置文件 ${PROJECT_CONFIG_PATH}`);
   if (!fs.existsSync(PROJECT_CONFIG_PATH)) {
     console.log(`项目配置文件 ${PROJECT_CONFIG_NAME} 不存在，请确认当前是否在 ${pkg.name} 项目根目录。`);
     shelljs.exit(-1);
   }
 }

  // 获取当前分支（用于显示在确认提示中）
  PROJECT_DIR = PROJECT_CONFIG_PATH.substr(0, PROJECT_CONFIG_PATH.length - PROJECT_CONFIG_NAME.length);
  let displayBranch = branchName;
  if (!displayBranch) {
    const currentDir = shelljs.pwd().toString();
    shelljs.cd(PROJECT_DIR);
    const currentBranchResult = shelljs.exec('git symbolic-ref --short HEAD', { silent: true });
    shelljs.cd(currentDir);
    if (currentBranchResult.code === 0) {
      displayBranch = currentBranchResult.stdout.trim();
    } else {
      displayBranch = "当前分支";
    }
  }

  // 添加用户确认
  const prompt = [
    {
      type: 'confirm',
      name: 'confirm',
      message: `确认将分支 ${displayBranch} 合并到 master 分支吗？`,
      default: false
    }
  ];
  const { confirm } = await inquirer.prompt(prompt);
  if (!confirm) {
    console.log('合并操作已取消');
    return;
  }
  
  // 合并主工程
  const mergeSuccess = await mergeMainProject(branchName);
  if (!mergeSuccess) {
    console.log('主工程合并失败，终止子模块合并');
    shelljs.exit(-1);
  }

  // 合并子模块
  let devModulesDir = path.join(PROJECT_DIR, 'devModules');
  const submodulesSuccess = await releaseModules(devModulesDir);
  
  // 检查子模块合并结果
  if (submodulesSuccess) {
    shelljs.echo('\n* 所有子模块合并成功！')
    const commitSuccess = await commitAndTagMainProject()
    if (commitSuccess) {
      shelljs.echo('\n🎉 Release 操作全部完成！')
    } else {
      shelljs.echo('\n❌ 主工程提交或打tag失败，请手动处理。')
      shelljs.exit(-1)
    }
  } else {
    shelljs.echo('\n❌ 存在子模块合并失败，请检查上面的错误信息。')
    shelljs.exit(-1)
  }
}

program.parse(process.argv);