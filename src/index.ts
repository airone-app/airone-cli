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


//#region [members]       全局定义

// 全局变量
const USER_HOME = process.env.HOME || process.env.USERPROFILE || '~'
const GLOBAL_DIR_NAME = '.' + pkg.name
const GLOBAL_DIR = path.join(USER_HOME, GLOBAL_DIR_NAME)
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_DIR, 'config.json')
const GLOBAL_REPOSITORY_DIR = path.join(GLOBAL_DIR, 'repository')
const GLOBAL_REPOSITORY_PACKAGE = path.join(GLOBAL_REPOSITORY_DIR, 'package.json')
let PROJECT_DIR = shelljs.pwd().toString()
let PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, 'airone.json')
const ERROR_MSG = `${pkg.name} 更新失败，请重试或手动更新`;
const ROOT_TEMPLATE = 'http://git.jyblife.com/airone/root-templete.git';
const MODULE_TEMPLATE = 'https://github.com/airone-app/module-templete.git'

// 新建 program 对象，全局命令行对象
const program = new Command(pkg.name)
const spinner = OraJS()

// ---- 项目配置文件框架
interface AironeConfig {
  /** 项目名 */
  name: string

  /** 项目描述 */
  desc?: string

  /** 项目版本号 */
  version: string

  /** 依赖模块（非源码） */
  modules: { name: string, git: string, branch?: string }[]

  /** 依赖模块（源码模块） */
  devModules: { name: string, git: string, branch?: string }[]
}

// ---- 接口、类型定义
interface Config {
  version: string // 版本号
  lastUpgrade?: string // 上次更新日期
  [propName: string]: any
}

//#endregion


//#region [main]          命令行基本信息

// 版本信息
program.addHelpText('before', `${pkg.description}latest version: ${pkg.version}\n`);

// 版本号
// program.version(pkg.version, '-v, --version', 'Print the current version');
program.version(pkg.version, '-v, --version', '打印版本信息');

// 作者

// 帮助
// program.on('--help', () => { })

// 使用示例
// program.addHelpText('after', `
// run "${pkg.name} -h | --help" for help.
// You can also use "${pkg.name} command -h" to check the specific command such as "${pkg.name} install -h".
// `);
program.addHelpText('after', `
您还可以运行： "${pkg.name} command -h" 来查看单个具体命令的帮助，比如您想知道 install 命令的用法，只需敲入 "${pkg.name} install -h".
`);

//#endregion


//#region [main]          主要方法

const readMap = async (mapFileDir: string = PROJECT_DIR, defaultMap: any = {}) => {
  const mapPath = path.join(mapFileDir, 'map.json')
  let originMap: any = {}
  let map: any = {}
  if (fs.existsSync(mapPath)) {
    const m = loadConfig(mapPath)
    originMap = m || {}
  }

  for (const key of Object.keys(originMap)) {
    if (key in defaultMap) {
      map[key] = defaultMap[key]
      continue
    }

    const prompt = [
      {
        type: 'input',
        name: 'value',
        default: originMap[key]['default'],
        message: originMap[key]['name'],
        validate: (value: string) => value.length > 0 || '不能为空'
      }
    ]

    // AironeConfig
    const { value } = await inquirer.prompt(prompt);
    map[key] = value
  }
  // shelljs.rm(mapPath);

  return map
}

function initIOSProject(map: any) {
  const iosDir = path.join(PROJECT_DIR, 'ios')

  spinner.start('生成iOS项目中...');
  convertDir(iosDir, map)
  spinner.stop()
}

function convertDir(dir: string, map: any) {
  var lsResult = fs.readdirSync(dir);
  lsResult.forEach(function (element, index) {
    const elementPath = path.join(dir, element)
    // 文件名或目录名替换
    Object.keys(map).forEach((key) => {
      element = element.replace(key, map[key])
    })
    let convertPath = path.join(dir, element)
    // 目录名替换
    if (convertPath != elementPath) {
      shelljs.mv(elementPath, convertPath)
    }
    if (fs.statSync(convertPath).isDirectory()) { // 递归遍历目录
      convertDir(convertPath, map)
    } else {
      Object.keys(map).forEach((key) => {
        const reg = new RegExp(key, 'g');
        shelljs.sed('-i', reg, map[key], convertPath);
      })
    }
  })
}

async function createAironeJson(projectName: string, projectDesc: string, projectVersion: string) {
  // 检查当前目录是否已存在项目配置文件
  if (fs.existsSync(PROJECT_CONFIG_PATH)) {
    shelljs.echo('airone.json 已存在')
    shelljs.exit(-1)
  }

  const initConfig: AironeConfig = {
    name: projectName,
    version: projectVersion,
    desc: projectDesc,
    modules: [],
    devModules: []
  }
  if (StringUtil.isEmpty(projectDesc)) {
    delete initConfig['desc']
  }

  // write config
  saveConfig(initConfig, PROJECT_CONFIG_PATH)
}

async function initProject() {
  shelljs.cd(PROJECT_DIR)

  // -- 用户输入项目基本信息
  const prompt = [
    {
      type: 'input',
      name: 'projectName',
      message: '项目名(英文小写)：',
      validate: (value: string) => value.length > 0 || '项目名不能为空'
    },
    {
      type: 'input',
      name: 'projectDesc',
      message: '项目描述：',
    },
    {
      type: 'input',
      name: 'projectVersion',
      message: '初始版本号：',
      default: '1.0.0',
    }
  ]
  const { projectName, projectDesc, projectVersion } = await inquirer.prompt(prompt);
  // 输入完信息后，项目工程目录需要修改
  PROJECT_DIR = path.join(shelljs.pwd().toString(), projectName)
  PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, 'airone.json')

  // -- 初始化壳工程
  if ((await timeConsumingCmd(`git clone ${ROOT_TEMPLATE} ${projectName} 1>&- 2>&-`, '正在拉取模块工程')).code !== 0) {
    shelljs.echo('拉取模块项目失败');
    return;
  }

  // 壳工程文本替换
  const map = await readMap()
  initIOSProject(map)

  await createAironeJson(projectName, projectDesc, projectVersion)

  console.log('项目初始化成功，配置文件在：' + PROJECT_CONFIG_PATH);
}

/**
 * new 命令 - 新建一个模块或其它（后面可扩展）
 */
async function newCommand() {
  // 用户选择要新建的项目
  const option = await selectNewOption()
  if (option == 'module') {
    await newModule()
  }
}

async function selectNewOption() {
  const prompt = [
    {
      type: 'list',
      name: 'option',
      default: 'module',
      message: `请选择您想新建什么项目`,
      choices: [
        { name: "module (airone 模块)", value: "module" },
      ],
    }
  ]
  // AironeConfig
  const { option } = await inquirer.prompt(prompt);
  return option
}

async function newModule() {
  const prompt = [
    {
      type: 'input',
      name: 'projectName',
      message: '模块名(请使用英文，如：AirBase)：',
      validate: (value: string) => value.length > 0 || '项目名不能为空'
    }
  ]
  const { projectName } = await inquirer.prompt(prompt);

  // 拉取模板工程
  if ((await timeConsumingCmd(`git clone ${MODULE_TEMPLATE} ${projectName} 1>&- 2>&-`, '正在拉取模块工程')).code !== 0) {
    shelljs.echo('拉取模块项目失败');
    return;
  }

  // 壳工程文本替换
  const map = await readMap(projectName, { 'AAAA': projectName })
  spinner.start('生成iOS项目中，请稍等...');
  shelljs.rm('-rf', path.join(projectName, '.git'))
  convertDir(projectName, map)
  spinner.stop()

  shelljs.echo('项目已生成，请自行进入模块开发及代码提交，祝您开发顺利，全年无bug~ (如在主项目中创建，注意将module添加入airone.json)')
}

//#endregion


//#region [scaffold]      脚手架方法

const timeConsumingCmd = (cmd: string, tips: string = 'Processing, please wait...'): Promise<{ code: number, stdout: string, stderr: string }> => {
  return new Promise((resolve, reject) => {
    spinner.start(tips)
    shelljs.exec(cmd, (code, stdout, stderr) => {
      spinner.stop()
      resolve({ code, stdout, stderr })
    })
  });
}

/** 自动升级 */
async function checkAndAutoUpgrade(force: boolean = false) {
  if (!force) {
    const config = loadConfig()
    if (config == null) {
      return;
    }

    const currentDate = DateUtil.currentDateStringWithFormat("yyyy-M-d");
    if (config.lastUpgrade == currentDate) {
      return;
    }
    console.log(`${pkg.name} 每日更新检查中，请稍等...`);

    // 更新全局配置
    const globalConfig = loadConfig() as Config
    globalConfig.lastUpgrade = DateUtil.currentDateStringWithFormat("yyyy-M-d");
    saveConfig(globalConfig)
  }

  await autoUpgrade()
}

async function autoUpgrade() {
  if (!shelljs.which('git')) {
    //在控制台输出内容
    shelljs.echo('本工具需要请安装 git，检查到系统尚未安装，请安装之.');
    shelljs.exit(1);
  }

  // 更新工具 git
  shelljs.cd(GLOBAL_DIR)
  if (fs.existsSync(GLOBAL_REPOSITORY_DIR)) { // 存在则进入目录，upgrade 之
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
  } else {
    shelljs.echo(ERROR_MSG + `(code ${result})`);
  }

  shelljs.exit(0)
}

/** 读配置文件（如果不给地址，配置文件将默认存储在系统用户根目录） */
const loadConfig = (configPath?: string): Config | null => {
  let config = {
    version: pkg.version,
    lastUpgrade: DateUtil.currentDateStringWithFormat("yyyy-M-d")
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



//#region [sub] command - 导入外部命令

program
  // .command('install [module]', 'Install one or more air-module (this operation will rewrite the exist module)').alias('i')
  .command('install [module]', '安装指定的模块(module)，不带模块将根据 airone.json 配置安装所有模块(注意：install 将重写已有模块)').alias('i')

program
  // .command('update [module]', 'update one or all air-modules （only update the exist module and will show tips of modified module）').alias('u')
  .command('update [module]', '更新指定的模块(module)，不带模块将根据 airone.json 配置更新所有模块').alias('u')

program
  // .command('dev', 'airone develop tools')
  .command('dev', 'airone 开发者工具')

program
  // .command('tag', 'Actions about git tag')
  .command('tag', '提供一些 tag 相关便利操作')

program
  // .command('tag', 'Actions about git tag')
  .command('branch', '提供一些 branch 相关便利操作')

program.command('release', '一键合并子模块代码到master')

//#endregion



//#region [sub] command - AutoUpgrade

program
  .command('upgrade')
  .description('auto check and update')
  .action(() => {
    checkAndAutoUpgrade(true)
  })

//#endregion



//#region [sub] command - Init

program
  .command('init')
  .description('在当前目录初始化一个 airone 主项目')
  // .description('Initialize an airone project')
  .action(() => {
    initProject()
  })

program
  .command('new')
  .description('生成一个 airone 模块(module)或插件(plugin)')
  // .description('Generate an airone new module or plugin')
  .action(() => {
    newCommand()
  })

//#endregion



//#region [interface]     定义及处理参数

async function main() {
  await checkAndAutoUpgrade()
  shelljs.cd(PROJECT_DIR)
  program.parse(process.argv)
}

//#endregion


main()
