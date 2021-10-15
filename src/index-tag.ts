/**
 *
 * Airone cli tag 工具
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
var PROJECT_DIR = shelljs.pwd().toString()
const PROJECT_CONFIG_NAME = 'airone.json'
var PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, PROJECT_CONFIG_NAME)
const ERROR_MSG = `${pkg.name} 更新失败，请重试或手动更新`;
var IosDir: string;
var AndroidDir: string;
var ModulesDir: string;
var DevModulesDir: string;
/** tag 子命令 */
var CMD: string | null = null

// 新建 program 对象，全局命令行对象
const program = new Command(pkg.name + ' tag')
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
Provide actions of git tag.\n`);

// 版本号
// program.version(pkg.version, '-v, --version', 'output the current version （查看当前版本号）');

// 作者

// 帮助
// program.on('--help', () => { })

// 使用示例
program.addHelpText('after', `
Run ${pkg.name} tag -h | --help for more help。
`);

// 选项参数
// program
//   .arguments('[cmd]')
//   .description('kkk')
//   .action((op) => {
//     CMD = op
//   })

// 命令
program
  .command('sync')
  .description('Sync the tag of all modules with remote')
  .action(() => {
    CMD = 'sync'
  })

//#endregion


//#region [scaffold] 脚手架方法

/**
 * 安全删除方法，将之移入项目根目录中的 .trash 中，以今日时间戳（精确到小时）命名
 * @param desPath
 */
 const safeRemove = (desPath: string) => {
  // 今日时间戳（精确到小时）
  const timestamp = DateUtil.currentDateStringWithFormat('yyyy-M-d-h-m')
  // 根据时间戳创建垃圾桶
  const trashDir = path.join(PROJECT_DIR, '.trash', timestamp)
  if (!fs.existsSync(trashDir)) {
    shelljs.mkdir('-p', trashDir)
  }
  shelljs.mv('-f', desPath, trashDir)
  shelljs.echo('Safe delete file:' + desPath + ', the file is move to: ' + trashDir)
}

const timeConsumingCmd = (cmd: string, tips: string = 'Processing, please wait...\n'): Promise<{ code: number, stdout: string, stderr: string }> => {
  return new Promise((resolve, reject) => {
    spinner.start(tips)
    shelljs.exec(cmd, (code, stdout, stderr) => {
      spinner.stop()
      resolve({ code, stdout, stderr })
    })
  });
}

/** 自动升级 */
const checkAndAutoUpdate = (force: boolean = false): void => {
  if (!force) {
    const config = loadConfig()
    if (config == null) {
      return;
    }

    const currentDate = DateUtil.currentDateStringWithFormat("yyyy-M-d");
    if (config.lastUpdate == currentDate) {
      return;
    }
    console.log(`${pkg.name} 每日更新检查中，请稍等...`);
  }

  autoUpdate()
}

const autoUpdate = async () => {
  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  // 更新工具 git
  shelljs.cd(GLOBAL_DIR)
  if (fs.existsSync(GLOBAL_REPOSITORY_DIR)) { // 存在则进入目录，update 之
    shelljs.cd(GLOBAL_REPOSITORY_DIR)
    await timeConsumingCmd(`git clean -df; git reset --hard HEAD 1>&- 2>&-`, '正在清理repository')
    await timeConsumingCmd(`git pull 1>&- 2>&-`, '正在拉取最新版本')
  } else { // 不存在则下载之
    if ((await timeConsumingCmd(`git clone ${pkg.repository.url} repository 1>&- 2>&-`, '正在拉取最新版本')).code !== 0) {
      shelljs.echo(ERROR_MSG);
      return;
    }
  }

  // 更新 git 成功则判断版本号是否需要升级
  if (!fs.existsSync(GLOBAL_REPOSITORY_PACKAGE)) { // 更新的命令文件不在
    shelljs.echo(ERROR_MSG);
    return
  }
  const newToolsPackage = loadConfig(GLOBAL_REPOSITORY_PACKAGE);
  if (newToolsPackage == null) {
    shelljs.rm('-rf', GLOBAL_REPOSITORY_DIR)
    return;
  }
  const versionOfNewGit = newToolsPackage.version
  if (versionOfNewGit == pkg.version) {
    // 版本相同不需要升级
    console.log('当前已是最新版本，无需要更新 ^_^');
    return;
  }

  // 有最新版本，更新之
  shelljs.cd(GLOBAL_REPOSITORY_DIR)
  const result = (await timeConsumingCmd(`npm install 1>&- 2>&-; npm run build 1>&- 2>&-; npm link 1>&- 2>&-`, `正在安装最新版 ${pkg.name}`)).code
  if (result == 0) {
    console.log('更新成功，当前最新版本：' + versionOfNewGit);
    // 更新全局配置
    const globalConfig = loadConfig() as Config
    globalConfig.lastUpdate = DateUtil.currentDateStringWithFormat("yyyy-M-d");
    saveConfig(globalConfig)
  } else {
    shelljs.echo(ERROR_MSG + `(code ${result})`);
  }
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


//#region [main]     主要方法

async function syncTagOfDir(dir: string) {
  // 遍历目录
  var lsResult: string[] = fs.readdirSync(dir);
  for (const element of lsResult) {
    let desPath = path.join(dir, element)
    await syncTagOfPath(desPath)
  }
  shelljs.echo('\nAll done!')
}

async function syncTagOfPath(desPath: string) {
  shelljs.cd(desPath)
  await timeConsumingCmd('git tag -l | xargs git tag -d && git fetch -t', 'Processing in: ' + desPath + '\n')
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

  if (CMD === 'sync') {
    if (!fs.existsSync(PROJECT_CONFIG_PATH)) {
      shelljs.echo('Please run this command in an airone project')
      shelljs.exit(-1)
    }

    await syncTagOfPath(PROJECT_DIR)
    await syncTagOfDir(DevModulesDir)
  }

}


main()