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
var PROJECT_DIR = shelljs.pwd().toString()
const PROJECT_CONFIG_NAME = 'airone.json'
var PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, PROJECT_CONFIG_NAME)
const ERROR_MSG = `${pkg.name} 更新失败，请重试或手动更新`;
var ModuleName: string | null = null

// 新建 program 对象，全局命令行对象
const program = new Command(pkg.name + ' install')
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
install airone modules
1. ${pkg.name} install :  Install all the dependency module base on the airone.json.
2. ${pkg.name} install ModuleName:  Install specific module of given name, and it'll update the airone.json after success.
`);

// 版本号
// program.version(pkg.version, '-v, --version', 'output the current version （查看当前版本号）');

// 作者

// 帮助
// program.on('--help', () => { })

// 使用示例
program.addHelpText('after', `
Run ${pkg.name} install -h | --help for more help。
`);

program
  .arguments('[module]')
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

async function updateAironeJson(module: string): Promise<[string, AironeModule]> {
  // 访问新库安装到哪个位置
  const projectConfig: AironeConfig = loadConfig(PROJECT_CONFIG_PATH) as AironeConfig
  const prompt = [
    {
      type: 'list',
      name: 'dir',
      default: 'devModules',
      message: `${module} 是库模块(module)还是开发模块(devModule)？`,
      choices: [
        "modules",
        "devModules",
      ],
    }, {
      type: 'input',
      name: 'git',
      message: `请输入 ${module} 的git地址`,
      validate: (value: string) => value.length > 0 || '不能为空'
    }, {
      type: 'input',
      name: 'branch',
      default: 'master',
      message: `请输入 ${module} 的拉取分支，默认master`,
      validate: (value: string) => value.length > 0 || '不能为空'
    }, {
      type: 'input',
      name: 'tag',
      message: `请输入 ${module} 的tag，可以为空`,
    }
  ]
  // AironeConfig
  const { dir, git, branch, tag } = await inquirer.prompt(prompt);
  const newModule = {
    name: module, git, branch, tag
  }

  if (dir == 'modules') {
    for (const airModule of projectConfig.modules) {
      if (airModule.name == module) {
        const prompt = [
          {
            type: 'confirm',
            name: 'value',
            default: false,
            message: `当前项目已存在 ${module} 是否继续?`
          }
        ]

        // AironeConfig
        const { value } = await inquirer.prompt(prompt);
        if (value == false) {
          shelljs.exit(-1)
        }

        var index = projectConfig.modules.indexOf(airModule);
        if (index > -1) {
          projectConfig.modules.splice(index, 1);
        }
        break;
      }
    }
    projectConfig.modules.push(newModule)
  } else if (dir == 'devModules') {
    for (const airModule of projectConfig.devModules) {
      if (airModule.name == module) {
        const prompt = [
          {
            type: 'confirm',
            name: 'value',
            default: false,
            message: `当前项目已存在 ${module} 是否继续?`
          }
        ]

        // AironeConfig
        const { value } = await inquirer.prompt(prompt);
        if (value == false) {
          shelljs.exit(-1)
        }

        var index = projectConfig.devModules.indexOf(airModule);
        if (index > -1) {
          projectConfig.devModules.splice(index, 1);
        }
        break;
      }
    }
    projectConfig.devModules.push(newModule)
  }

  saveConfig(projectConfig, PROJECT_CONFIG_PATH)

  return [dir, newModule];
}

/** 下载单个模块 */
async function downloadModule(module: AironeModule, dir: string) {
  if (fs.existsSync(dir)) { // 若模块已存在，删除之
    shelljs.rm('-rf', dir)
  }

  // 下载 git
  let code = 0
  if (!StringUtil.isEmpty(module.branch)) {
    code = (await timeConsumingCmd(`git clone -b ${module.branch} ${module.git} ${dir} 1>&- 2>&-`, `模块 ${module.name} 下载中`)).code
  } else if (!StringUtil.isEmpty(module.tag)) {
    code = (await timeConsumingCmd(`git clone -b ${module.tag} ${module.git} ${dir} 1>&- 2>&-`, `模块 ${module.name} 下载中`)).code
  } else {
    code = (await timeConsumingCmd(`git clone -b ${module.git} ${dir} 1>&- 2>&-`, `模块 ${module.name} 下载中`)).code
  }

  // 结果处理
  if (code == 0) {
    console.log(`模块 ${module.name} 已下载成功.`);
  } else {
    console.log(`模块 ${module.name} 下载失败`);
    shelljs.exit(-1)
  }
}

/** 更新单个模块 */
const updateModule = (module: AironeModule, dir: string) => {
  //TODO: 模块更新功能
}

/** 更新多个模块 */
async function updateModules(modules: Array<AironeModule>, dir: string) {
  if (modules == null || modules.length == 0) {
    return;
  }

  // 判断目录是否存在
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  } else {
    const prompt = [
      {
        type: 'confirm',
        name: 'value',
        default: false,
        message: `install 命令将清空 ${dir.substring(dir.lastIndexOf('/'))} 目录，请事先将保存您所有改动，是否继续?`
      }
    ]

    // AironeConfig
    const { value } = await inquirer.prompt(prompt);
    if (value == false) {
      shelljs.echo('用户取消操作！');
      shelljs.exit(-1)
    } else {
      shelljs.rm('-rf', dir);
      fs.mkdirSync(dir)
    }
  }

  // 遍历模块并下载之
  for (const module of modules) {
    // 先判断模块是否存在，若存在，需要走模块更新逻辑
    const moduleDir = path.join(dir, module.name)
    if (fs.existsSync(moduleDir)) {
      updateModule(module, moduleDir)
    } else {
      await downloadModule(module, moduleDir)
    }
  }
}

async function addModule(module: AironeModule, dir: string) {
  if (module == null || StringUtil.isEmpty(module.git)) {
    return;
  }

  // 判断目录是否存在
  const moduleDir = path.join(dir, module.name)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  } else if (fs.existsSync(moduleDir)) {
    const prompt = [
      {
        type: 'confirm',
        name: 'value',
        default: true,
        message: `${module.name}已存在，继续安装将覆盖之，是否继续?`
      }
    ]

    // AironeConfig
    const { value } = await inquirer.prompt(prompt);
    if (value == false) {
      updateModule(module, moduleDir)
      return;
    } else {
      shelljs.rm('-rf', moduleDir);
      fs.mkdirSync(moduleDir)
    }
  }

  await downloadModule(module, moduleDir)
}



async function installReactNativeSupport(dir: string) {
  shelljs.cd(dir)
  if (fs.existsSync(path.join(dir, './tools/devTool.py'))) {
    await timeConsumingCmd(`./tools/devTool.py -u 1>&- 2>&-`, '正在安装 React Native 依赖，耗时操作，请耐心等候（大约 2 min）')
  }
}

//#endregion


//#region [main]     iOS 主要方法

async function iosInstallModule(config: AironeConfig, module: string) {
  await rewritePodfile(config, module)
  await installPods()
}

async function iosProjectProcess(config: AironeConfig) {
  await rewritePodfile(config)
  await installPods()
}

async function rewritePodfile(config: AironeConfig, module: string | null = null) {
  const iosDir = path.join(PROJECT_DIR, 'ios')

  // 修复 iOS podfile 文件
  const podfile = fs.readFileSync(path.join(iosDir, 'podfile')).toString();
  let podFileLines = podfile.split('\n')
  let aironeStart = 0, airEnd = 0;
  podFileLines.forEach((line, index) => {
    if (line.indexOf('generate by airone') != -1) {
      aironeStart = index
    } else if (line.indexOf('end of airone') != -1) {
      airEnd = index
    }
  })

  // insert the modules infos
  const modules = []
  modules.push('\ndef airone_modules!()') // start
  modules.push('\n    # -- modules')
  for (const module of config.modules) {
    modules.push(`    pod '${module.name}', :path => '../modules/${module.name}'`)
  }
  podFileLines.splice(aironeStart + 1, airEnd - aironeStart - 1, ...modules)
  aironeStart += modules.length

  // insert the devModules infos
  const devModules = []
  devModules.push('\n    # -- devModules')
  for (const module of config.devModules) {
    devModules.push(`    pod '${module.name}', :path => '../devModules/${module.name}'`)
  }
  devModules.push('end\n') // end
  podFileLines.splice(aironeStart + 1, 0, ...devModules)
  aironeStart += devModules.length

  // 往第一个 target 中添加 airone_modules 方法引用
  let { targetIndex, targetName } = findTarget(podFileLines)
  while (targetIndex != -1) {
    // 让用户确定是否注入
    const prompt = [
      {
        type: 'confirm',
        name: 'inject',
        default: true,
        message: `[iOS] 找到 iOS target ${targetName} ，是否注入 airone 依赖？`,
      }
    ]

    // 由用户决定是否注入
    const { inject } = await inquirer.prompt(prompt);
    if (inject) {
      podFileLines.splice(targetIndex + 1, 0, '\n    airone_modules!')
    } else {
      podFileLines.splice(targetIndex + 1, 0, '\n    # airone_ignore!')
    }

    // 找下一个 target
    const result = findTarget(podFileLines)
    targetIndex = result.targetIndex
    targetName = result.targetName
  }

  fs.writeFileSync(path.join(iosDir, 'Podfile'), podFileLines.join('\n'));
}

/**
 * @description 找 podfile 中还未添加 airone 方法的 target
 * @returns {index} index :target 所在的行数, -1 表示没找到, targetName: target名
 */
function findTarget(podFileLines: Array<string>): { targetIndex: number, targetName: string } {
  let findTarget = false, findInvoke, findIndex = -1, targetName = '';
  for (let index = 0; index < podFileLines.length; index++) {
    const line = podFileLines[index];

    const startReg = /target (.*) do/i;
    if (startReg.test(line)) {
      const matchResult = line.match(startReg)
      targetName = matchResult ? matchResult[1] : 'unknown'
      findTarget = true
      findIndex = index;
    }

    if (findTarget && /airone_.*!/i.test(line)) { // 在 target 中找到 airone_ 开头的即是 airone 方法，则跳过之
      findIndex = -1
    }
    else if (findTarget && line == 'end' && findIndex != -1) {
      break;
    }
    else if (findTarget && line == 'end' && findIndex == -1) {
      findTarget = false
    }
  }

  return {
    targetIndex: findIndex, targetName
  }
}

/** 安装 iOS pods */
async function installPods() {
  const iosDir = path.join(PROJECT_DIR, 'ios')
  shelljs.cd(iosDir)

  const prompt = [
    {
      type: 'confirm',
      name: 'fullInstall',
      default: false,
      message: `[iOS] pod 是否全量更新 repository ?`,
    }
  ]

  // 由用户决定是否注入
  const { fullInstall } = await inquirer.prompt(prompt);

  if (fullInstall) {
    shelljs.exec('pod install --verbose')
  } else {
    shelljs.exec('pod install --no-repo-update --verbose')
  }
}

//#endregion



//#region [interface]  命令行定义及处理参数

program.parse(process.argv)

//#endregion


async function main() {
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
  let iosDir = path.join(PROJECT_DIR, 'ios')
  let androidDir = path.join(PROJECT_DIR, 'android')
  let modulesDir = path.join(PROJECT_DIR, 'modules')
  let devModulesDir = path.join(PROJECT_DIR, 'devModules')

  const options = program.opts();

  const projectConfig: AironeConfig = loadConfig(PROJECT_CONFIG_PATH) as AironeConfig
  if (StringUtil.isEmpty(ModuleName)) { // 全局安装
    await updateModules(projectConfig.modules, path.join(PROJECT_DIR, 'modules'))
    await updateModules(projectConfig.devModules, path.join(PROJECT_DIR, 'devModules'))
    await installReactNativeSupport(path.join(PROJECT_DIR, 'rn'))
    await iosProjectProcess(projectConfig)
  } else {
    const [dir, module] = await updateAironeJson(ModuleName as string)
    await addModule(module, dir)
    await iosProjectProcess(projectConfig)
  }

}


main()