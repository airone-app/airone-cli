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
一键操作 air 模块分支命令
检测 airone.json 中配置为 branch 的模块，并执行对应操作
`);

program
  .arguments('[branch]')
  .option('-m, --move <newBranch>', 'Move/Rename to a new branch')
  .action((branch, options) => {
    BranchName = options.move ?? branch
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

//#region [main]  checkout modules
const outputOverAll: string[] = []
const pushOverAll: string[] = []
async function makeModulesBranch(dirPath: string) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return;
  }

  var lsResult: string[] = fs.readdirSync(dirPath);
  const projectConfig: AironeConfig = loadConfig(PROJECT_CONFIG_PATH) as AironeConfig

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

      // 1. 先检查此目录是否有修改
      if (!checkProjModify(elementPath)) { // 有修改
        const msg = `X ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 下有改动还未提交，请先提交之.`
        outputOverAll.push(msg)
        shelljs.echo(msg)
      }
      // 2. 更新 branch
      else if (!makeProjBranch(elementPath, element, projectConfig.devModules)) {
        const msg = `X ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 创建分支报错，请自行检查 `
        outputOverAll.push(msg)
        shelljs.echo(msg)
      }
      else {
        outputOverAll.push(`√ ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} Success！`)
      }

      // 即出目录
      shelljs.cd('..')
    }
  }

  shelljs.echo(outputOverAll.join('\n')) 
  if (pushOverAll.length > 0) {
    shelljs.echo('------------- Push Result ------------')
    shelljs.echo(pushOverAll.join('\n')) 
  }
  saveConfig(projectConfig, PROJECT_CONFIG_PATH)
}

function makeProjBranch(checkPath: string, element: string, modules: AironeModule[]): boolean {
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
      break
    }
  }

  if (airModule && airModule.branch && BranchName) {
    const result = shelljs.exec('git branch ' + BranchName, { silent: true })
    if (result.code == 0) {
      shelljs.echo('Make branch: ' + BranchName + ' - Success!')
      airModule.branch = BranchName
      const pushResult = shelljs.exec('git push origin -u ' + BranchName, { silent: true })
      pushOverAll.push('Push branch: ' + BranchName + (pushResult.code === 0 ? ' - Success!' : ' - Failed!'))
      return true
    } else {
      shelljs.echo('Make branch: ' + BranchName + ' - Failed!')
      return false
    }
  }
  shelljs.echo('continue');

  return true
}

async function renameModules(dirPath: string) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return;
  }

  var lsResult: string[] = fs.readdirSync(dirPath);
  const projectConfig: AironeConfig = loadConfig(PROJECT_CONFIG_PATH) as AironeConfig

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

      // 1. 先检查此目录是否有修改
      if (!checkProjModify(elementPath)) { // 有修改
        const msg = `X ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 下有改动还未提交，请先提交之.`
        outputOverAll.push(msg)
        shelljs.echo(msg)
      }
      // 2. 更新 branch
      else if (!renameProjBranch(elementPath, element, projectConfig.devModules)) {
        const msg = `X ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} 重命名分支报错，请自行检查 `
        outputOverAll.push(msg)
        shelljs.echo(msg)
      }
      else {
        outputOverAll.push(`√ ${elementPath.substring(elementPath.lastIndexOf('/') + 1)} Success！`)
      }

      // 即出目录
      shelljs.cd('..')
    }
  }

  shelljs.echo(outputOverAll.join('\n')) 
  if (pushOverAll.length > 0) {
    shelljs.echo('------------- Push Result ------------')
    shelljs.echo(pushOverAll.join('\n')) 
  }
  saveConfig(projectConfig, PROJECT_CONFIG_PATH)
}

function renameProjBranch(checkPath: string, element: string, modules: AironeModule[]): boolean {
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
      break
    }
  }

  if (airModule && airModule.branch && BranchName) {
    const oldBranch = airModule.branch
    const result = shelljs.exec('git branch -m ' + oldBranch + ' ' + BranchName, { silent: true })
    if (result.code == 0) {
      shelljs.echo('Rename branch: ' + BranchName + ' - Success!')
      airModule.branch = BranchName
      const deleteResult = shelljs.exec('git push origin -d ' + oldBranch, { silent: true })
      pushOverAll.push('Delete remote branch: ' + oldBranch + (deleteResult.code === 0 ? ' - Success!' : ' - Failed!'))
      const pushResult = shelljs.exec('git push origin -u ' + BranchName, { silent: true })
      pushOverAll.push('Push branch: ' + BranchName + (pushResult.code === 0 ? ' - Success!' : ' - Failed!'))
      return true
    } else {
      shelljs.echo('Rename branch:' + BranchName + ' - Failed!')
      return false
    }
  }
  shelljs.echo('continue');

  return true
}

function checkProjModify(checkPath: string): boolean {
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
//#endregion


//#region [interface]  命令行定义及处理参数

program.parse(process.argv)

//#endregion


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
  PROJECT_DIR = PROJECT_CONFIG_PATH.substr(0, PROJECT_CONFIG_PATH.length - PROJECT_CONFIG_NAME.length)
  const projectConfig: AironeConfig = loadConfig(PROJECT_CONFIG_PATH) as AironeConfig

  let iosDir = path.join(PROJECT_DIR, 'ios')
  let androidDir = path.join(PROJECT_DIR, 'android')
  let modulesDir = path.join(PROJECT_DIR, 'modules')
  let devModulesDir = path.join(PROJECT_DIR, 'devModules')

  const options = program.opts();
  if (options && options.move) {
    await renameModules(modulesDir)
    await renameModules(devModulesDir)
  } else {
    await makeModulesBranch(modulesDir)
    await makeModulesBranch(devModulesDir)
  }
}


main()