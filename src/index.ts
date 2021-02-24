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


// 新建 program 对象，全局命令行对象
const program = new Command(pkg.name)
const spinner = OraJS()

//#region [define]  接口、类型定义

interface Config {
  version: string // 版本号
  lastUpdate: string // 上次更新日期
  // [propName: string]: any
}

//#endregion


//#region [main]  命令行基本信息

// 版本信息
program.addHelpText('before', `${pkg.description} \nversion: ${pkg.version}`);

// 版本号
program.version(pkg.version, '-v, --version', 'output the current version （查看当前版本号）');

// 作者

// 帮助
// program.on('--help', () => { })

// 使用示例
program.addHelpText('after', `
运行 ${pkg.name} -h | --help 查看命令使用。
`);

//#endregion


//#region [scaffold] 脚手架方法

const timeConsumingCmd = (cmd: string, tips: string): Promise<{code: number, stdout: string, stderr: string}> => {
  return new Promise((resolve, reject) => {
    spinner.start(tips)
    shelljs.exec(cmd, (code, stdout, stderr) => {
      spinner.stop()
      resolve({code, stdout, stderr})
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
    console.log(`${pkg.name} 每日更新中，请稍等...`);
  }

  autoUpdate()
}

const autoUpdate = async () => {
  const USER_HOME = process.env.HOME || process.env.USERPROFILE || '~'
  const PROJECT_DIR_NAME = '.' + pkg.name
  const PROJECT_DIR = path.join(USER_HOME, PROJECT_DIR_NAME)
  const PROJECT_REPOSITORY_DIR = path.join(PROJECT_DIR, 'repository')
  const PROJECT_REPOSITORY_PATH = path.join(PROJECT_REPOSITORY_DIR, `${pkg.name}`)
  const ERROR_MSG = `${pkg.name} 更新失败，请重试或手动更新`;

  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  // 更新工具 git
  shelljs.cd(PROJECT_DIR)
  fs.existsSync(PROJECT_REPOSITORY_DIR) && shelljs.rm('-rf', PROJECT_REPOSITORY_DIR)
  if ((await timeConsumingCmd(`git clone ${pkg.repository.url} repository 1>&- 2>&-`, '正在拉取最新版本')).code !== 0) {
    shelljs.echo(ERROR_MSG);
  }
  else { // 更新 git 成功则判断版本号是否需要升级
    if (!fs.existsSync(PROJECT_REPOSITORY_PATH)) { // 更新的命令文件不在
      shelljs.echo(ERROR_MSG);
      return
    }
    shelljs.chmod('a+x', PROJECT_REPOSITORY_PATH)
    const version = shelljs.exec(`${PROJECT_REPOSITORY_PATH} --version`).toString()
    const versionOfNewGit = version.replace('\n', '');
    if (versionOfNewGit == pkg.version) {
      // 版本相同不需要升级
      console.log('当前已是最新版本，无需要更新 ^_^');
      return;
    }

    // 有最新版本，更新之
    console.log(`检查到存在最新版本 ${versionOfNewGit}，正在更新到系统命令，需要管理员权限:`);
    const result = shelljs.exec(`sudo mv ${PROJECT_REPOSITORY_PATH} /usr/local/bin/`).code
    if (result == 0) {
      console.log('更新成功，当前最新版本：' + versionOfNewGit);
    } else {
      shelljs.echo(ERROR_MSG);
    }
  }
}

/** 读配置文件（如果不给地址，配置文件将默认存储在系统用户根目录） */
const loadConfig = (configPath?: string): Config => {
  const USER_HOME = process.env.HOME || process.env.USERPROFILE || '~'
  const DIR_NAME = '.' + pkg.name
  const USER_CONFIG_DIR = path.join(USER_HOME, DIR_NAME)
  const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, 'config.json')
  let config = {
    version: pkg.version,
    lastUpdate: DateUtil.currentDateStringWithFormat("yyyy-M-d")
  }

  if (configPath == undefined) {
    configPath = USER_CONFIG_PATH;
    // 配置路径不存在则新建之
    if (!fs.existsSync(USER_CONFIG_DIR)) {
      console.log('Create project global config dir => ', USER_CONFIG_DIR);
      fs.mkdirSync(USER_CONFIG_DIR)
    }
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
  const USER_HOME = process.env.HOME || process.env.USERPROFILE || '~'
  const DIR_NAME = '.' + pkg.name
  const USER_CONFIG_DIR = path.join(USER_HOME, DIR_NAME)
  const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, 'config.json')

  if (configPath == undefined) {
    configPath = USER_CONFIG_PATH;
    // 配置路径不存在则新建之
    if (!fs.existsSync(USER_CONFIG_DIR)) {
      console.log('Create project global config dir => ', USER_CONFIG_DIR);
      fs.mkdirSync(USER_CONFIG_DIR)
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, "\t"))
}

//#endregion



//#region [sub] command - 导入外部命令


//#endregion



//#region [sub] command - AutoUpdate

program
  .command('update')
  .description('脚本自动升级')
  .action(() => {
    checkAndAutoUpdate()
  })

//#endregion


//#region [interface]  定义及处理参数

program.parse(process.argv)

//#endregion



// process.exit 表示退出