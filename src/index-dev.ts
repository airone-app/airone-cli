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
const PROJECT_DIR = shelljs.pwd().toString()
const PROJECT_CONFIG_NAME = 'airone.json'
const PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, PROJECT_CONFIG_NAME)
const ERROR_MSG = `${pkg.name} 更新失败，请重试或手动更新`;

// 新建 program 对象，全局命令行对象
const program = new Command(pkg.name)
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
airone 开发便利工具
1. 直接运行(不带参数):  ${pkg.name} dev 根据工程目录 airone.json 安装配置中的所有依赖模块。
2. 安装指定 air 模块:  ${pkg.name} install xx，安装指定的 air 模块，安装成功后会更新 airone.json。
`);

// 版本号
// program.version(pkg.version, '-v, --version', 'output the current version （查看当前版本号）');

// 作者

// 帮助
// program.on('--help', () => { })

// 使用示例
program.addHelpText('after', `
运行 ${pkg.name} install -h | --help 查看命令使用。
`);

program
  .option('-u,--update-path [path]', '更新指定目录中所有模块代码')

//#endregion


//#region [scaffold] 脚手架方法

const timeConsumingCmd = (cmd: string, tips: string = '处理中，请稍候'): Promise<{ code: number, stdout: string, stderr: string }> => {
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

const outputOverAll: string[] = []
function updateModules(dirPath = './') {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    shelljs.echo('目录不存在或并不是一个目录')
    shelljs.exit(-1);
  }

  var lsResult = fs.readdirSync(dirPath);

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
      shelljs.echo(`checking ${elementPath} ...`)
      shelljs.cd(elementPath)
      // 1. 先检查此目录是否有修改
      if(!checkProjModify(elementPath)) { // 有修改
        const msg = `* ${elementPath} 下有改动还未提交，请先提交之`
        outputOverAll.push(msg)
        shelljs.echo(msg)
      }
      // 2. 更新当前目录
      else if(!checkProjPull(elementPath)) { // 有修改
        const msg = `* ${elementPath} 下有冲突! 需要手动更新！`
        outputOverAll.push(msg)
        shelljs.echo(msg)
      }
      else {
        outputOverAll.push(`* ${elementPath} 更新成功`)
      }

      shelljs.echo('\n\n')
      // 即出目录
      shelljs.cd('..')
    }
  }

  shelljs.echo(outputOverAll.join('\n'))
}

function checkProjModify(checkPath: string): boolean {
  shelljs.echo(`* 正在检查目录： ${checkPath}，检查是否有改动未提交...`)

  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  shelljs.echo('--- console output ---')
  const result = shelljs.exec('git status')
  shelljs.echo('----------------------')
  const resultList = result.toString().split('\n')
  if (resultList.length > 0) {
    const lastLine = resultList[resultList.length - 1]
    const lastLine2 = resultList[resultList.length - 2]
    if (lastLine.indexOf('nothing to commit') != -1) {
      shelljs.echo(`当前目录 clean ！`)
      return true;
    } else if  (lastLine2.indexOf('nothing to commit') != -1) {
      shelljs.echo(`当前目录 clean ！`)
      return true;
    }
  }

  return false;
}

function checkProjPull(checkPath: string): boolean {
  shelljs.echo(`* 正在更新目录： ${checkPath}...`)

  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  shelljs.echo('--- console output ---')
  const result = shelljs.exec('git pull --rebase')
  shelljs.echo('----------------------')
  const resultList = result.toString().split('\n')
  if (resultList.length > 0) {
    const lastLine = resultList[resultList.length - 1]
    const lastLine2 = resultList[resultList.length - 2]
    if (lastLine.indexOf('Current branch master is up to date') != -1) {
      shelljs.echo(`当前目录 "${checkPath}" 更新成功 ！`)
      return true;
    } else if  (lastLine2.indexOf('Current branch master is up to date') != -1) {
      shelljs.echo(`当前目录 "${checkPath}" 更新成功 ！`)
      return true;
    }
  }

  return false;
}

//#endregion



//#region [interface]  命令行定义及处理参数

program.parse(process.argv)

//#endregion


async function main () {
  const options = program.opts();

  if (options.updatePath) {
    updateModules(typeof(options.updatePath) == 'string' ? options.updatePath: undefined)
  }
}


main()