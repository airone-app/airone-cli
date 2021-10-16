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
import { DateUtil, StringUtil } from './base'


//#region [define]   全局定义

// 全局变量
const USER_HOME = process.env.HOME || process.env.USERPROFILE || '~'
const GLOBAL_DIR_NAME = '.' + pkg.name
const GLOBAL_DIR = path.join(USER_HOME, GLOBAL_DIR_NAME)
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_DIR, 'config.json')
const GLOBAL_REPOSITORY_DIR = path.join(GLOBAL_DIR, 'repository')
const GLOBAL_REPOSITORY_PACKAGE = path.join(GLOBAL_REPOSITORY_DIR, 'package.json')
const PROJECT_CONFIG_NAME = 'airone.json'
var PROJECT_DIR = shelljs.pwd().toString()
var PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, PROJECT_CONFIG_NAME)
const ERROR_MSG = `${pkg.name} 更新失败，请重试或手动更新`;
var IosDir: string;
var AndroidDir: string;
var ModulesDir: string;
var DevModulesDir: string;
/** tag 子命令 */
var ModuleName: string;

// 新建 program 对象，全局命令行对象
const program = new Command(pkg.name + ' dev')
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

//#endregion


//#region [main]     命令行基本信息

// 版本信息
program.addHelpText('before', `
airone dev 开发便利工具
`);

// 版本号
// program.version(pkg.version, '-v, --version', 'output the current version （查看当前版本号）');

// 作者

// 帮助
// program.on('--help', () => { })

// 使用示例
program.addHelpText('after', `
运行 ${pkg.name} dev -h | --help 查看命令使用。
`);

// program
//   .option('-u,--update-path [path]', '更新指定目录中所有模块代码')

// 命令
program
  .arguments('[module]')
  .description('[module]:\n  指定要开发的模块(module)，提供指引以设置模块的分支名(没指定则为开发当前目录下的模块)')
  .action((op) => {
    ModuleName = op
  })

//#endregion


//#region [scaffold] 脚手架方法

const timeConsumingCmd = (cmd: string, tips: string = 'Processing, please wait...'): Promise<{ code: number, stdout: string, stderr: string }> => {
  return new Promise((resolve, reject) => {
    spinner.start(tips)
    shelljs.exec(cmd, (code, stdout, stderr) => {
      spinner.stop()
      resolve({ code, stdout, stderr })
    })
  });
}


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


//#region [main] 主要方法

/**
 * 开发模块准备：
 * 1. 给模块新建一个分支
 */
function devModule(moduleName: string) {
  if (!fs.existsSync(PROJECT_CONFIG_PATH)) {
    shelljs.echo('请在 airone 项目中运行命令')
    shelljs.exit(-1)
  }

  let moduleDir: string | null = null

  if (moduleName == undefined) {
    if (shelljs.pwd().toString().indexOf(DevModulesDir) > -1) {
      moduleName = path.basename(shelljs.pwd().toString())
    }
  }

  if (moduleName != undefined) {
    moduleDir = path.join(DevModulesDir, moduleName)
  }

  if (moduleDir == null || !fs.existsSync(moduleDir)) {
    shelljs.echo('module 不存在: ' + moduleDir)
    shelljs.exit(-1)
  }

  // 给指定目录建 git 分支
  makeBranchOfDir(moduleDir)
}

/**
 *  给指定目录建 git 分支
 */
async function makeBranchOfDir(moduleDir: string) {
  shelljs.cd(moduleDir)

  // 检查当前是否有未提交修改
  checkProjModify(moduleDir)

  // 拉取代码
  fetchProject(moduleDir)
  checkProjPull(moduleDir)

  // 请输入您想要新建的模块分支名
  // 请输入您上面要新建的分支是基于哪个现有的分支拉取
  let newBranch = await checkoutNewBranch(moduleDir)

  // 将更新分支写入 airone.json
  updateAironeJson(path.basename(moduleDir), newBranch)
}


function checkProjModify(checkPath: string): boolean {
  shelljs.cd(checkPath)
  shelljs.echo('-n', `* 检查目录： ${checkPath.substring(checkPath.lastIndexOf('/') + 1)} 是否有改动未提交...`)

  if (!shelljs.which('git')) {
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  const result = shelljs.exec('git status -s')
  if (result.code != 0 || result.toString().length > 0) {
    shelljs.echo('该分支有修改未提交，请先 stash 之，再建立分支！');
    shelljs.exit(1);
  }

  shelljs.echo(`clean ！`)
  return true;
}

function fetchProject(checkPath: string): boolean {
  shelljs.cd(checkPath)

  if (!shelljs.which('git')) {
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  const result = shelljs.exec('git remote show origin; git remote prune origin; git fetch --all', { silent: true })

  return true;
}

function checkProjPull(checkPath: string): boolean {
  shelljs.cd(checkPath)
  shelljs.echo('-n', `* 正在更新目录： ${checkPath.substring(checkPath.lastIndexOf('/') + 1)}...`)

  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  const result = shelljs.exec('git pull --rebase', { fatal: true, silent: true })
  if (result.code != 0) {
    shelljs.echo(` git 更新Failure，请检查命令当前网络环境`)
    return false
  } else {
    shelljs.echo(` Success ！`)
    return true
  }

  return false;
}

/**
 * 给当前工作目录新建 git 分支
 */
async function checkoutNewBranch(moduleDir: string) {
  shelljs.cd(moduleDir);
  // 请输入您想要新建的模块分支名
  // 请输入您上面要新建的分支是基于哪个现有的分支拉取
  const prompt = [
    {
      type: 'input',
      name: 'branch',
      message: `请输入您想要新建的分支名`
    },
    {
      type: 'input',
      name: 'base',
      message: `请输入您上面要新建的分支是基于哪个现有的分支`
    }
  ]
  const { branch, base } = await inquirer.prompt(prompt);
  if (StringUtil.isEmpty(branch) || StringUtil.isEmpty(base)) {
    shelljs.echo('分支名不得为空')
    shelljs.exit(-1)
  }

  shelljs.exec(`git checkout -b ${branch} --track origin/${base}`)
  const result = shelljs.exec(`git push origin ${branch}:${branch}`)
  shelljs.exec(`git branch -u origin/${branch}`)
  if (result.code != 0) {
    shelljs.echo(` 建立分支失败！`)
    shelljs.exit(-1)
  } else {
    shelljs.echo(` 分支已建立：${branch} ！`)
  }

  return branch;
}

async function updateAironeJson(module: string, branch: string) {
  // 访问新库安装到哪个位置
  const projectConfig: AironeConfig = loadConfig(PROJECT_CONFIG_PATH) as AironeConfig

  for (const airModule of projectConfig.devModules) {
    if (airModule.name == module) {
      airModule.branch = branch;
      airModule.tag = undefined;
      break;
    }
  }

  saveConfig(projectConfig, PROJECT_CONFIG_PATH)

  shelljs.echo(` airone.json 已更新，请查看并确认之: ${PROJECT_CONFIG_PATH}`)
}

//#endregion



//#region [interface]  命令行定义及处理参数

program.parse(process.argv)

//#endregion


async function main() {
  // 目录自动搜索
  if (!fs.existsSync(PROJECT_CONFIG_PATH)) {
    PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, '../' + PROJECT_CONFIG_NAME);
    if (!fs.existsSync(PROJECT_CONFIG_PATH)) {
      PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, '../../' + PROJECT_CONFIG_NAME);
    }
  }
  if (fs.existsSync(PROJECT_CONFIG_PATH)) {
    PROJECT_DIR = PROJECT_CONFIG_PATH.substr(0, PROJECT_CONFIG_PATH.length - PROJECT_CONFIG_NAME.length)
    IosDir = path.join(PROJECT_DIR, 'ios')
    AndroidDir = path.join(PROJECT_DIR, 'android')
    ModulesDir = path.join(PROJECT_DIR, 'modules')
    DevModulesDir = path.join(PROJECT_DIR, 'devModules')
  }

  const options = program.opts();

  devModule(ModuleName)
}


main()