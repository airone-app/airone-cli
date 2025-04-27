import { Command } from 'commander';
import fs from 'fs/promises';
import fsSync from 'fs'; // 使用同步 fs 用于 loadConfig
import path from 'path';
import OraJS from 'ora';
import * as shelljs from 'shelljs'; // 需要 shelljs 来获取 PROJECT_DIR
import pkg from '../package.json'
const spinner = OraJS();

// --- 从 index-branch.ts 借鉴的定义 ---
// 注意：最好将这些共享的定义和函数放到一个公共模块中
const PROJECT_DIR = shelljs.pwd().toString(); // 获取当前工作目录
const PROJECT_CONFIG_NAME = 'airone.json';
const PROJECT_CONFIG_PATH = path.join(PROJECT_DIR, PROJECT_CONFIG_NAME);

const program = new Command(pkg.name + ' hooks')

interface AironeModule {
  name: string;
  git: string;
  version?: string;
  branch?: string;
  tag?: string;
}

interface AironeConfig {
  name: string;
  desc?: string;
  version: string;
  modules: AironeModule[];
  devModules: AironeModule[];
}

// 命令
program
  .command('install')
  .description('Install git hooks to the main project and devModules')
  .addHelpText('after', `

  将预定义的 Git hooks (例如 pre-commit, pre-push) 安装到主工程和子模块的 .git/hooks 目录中。

  用法示例:
    $ airone hooks install
`)
  .action(async () => {
    await installHooks();
  });

program.parse(process.argv)

// 简化的 loadConfig (仅用于加载项目配置)
// 注意：原版 loadConfig 有全局配置逻辑，这里简化为只读项目配置
const loadProjectConfig = (configPath: string): AironeConfig | null => {
  if (!fsSync.existsSync(configPath)) {
    return null;
  }
  try {
    const configBuff = fsSync.readFileSync(configPath);
    const configContent = configBuff?.toString();
    if (configContent) {
      return JSON.parse(configContent) as AironeConfig;
    }
  } catch (error) {
    console.error(`Error reading or parsing config file ${configPath}:`, error);
    return null;
  }
  return null;
};
// --- 结束借鉴 ---

/**
 * 将 hooks 安装到指定的目录
 * @param targetDir 目标目录（例如项目根目录或子模块目录）
 * @param displayName 用于日志输出的目录显示名称
 * @param sourceHooksDir 源 hooks 目录路径
 * @returns 返回安装是否成功
 */
async function installHooksToDirectory(targetDir: string, displayName: string, sourceHooksDir: string): Promise<boolean> {
    spinner.start(`Processing directory: ${displayName} at ${targetDir}`);
    let success = true;

    try {
        // 检查目标目录是否存在且为目录
        const dirStat = await fs.stat(targetDir);
        if (!dirStat.isDirectory()) {
            spinner.warn(`Skipping ${displayName} (path ${targetDir} is not a directory).`);
            return true; // 不是目录，跳过，不算失败
        }

        // 检查 .git 目录是否存在
        const gitDirPath = path.join(targetDir, '.git');
        try {
            await fs.access(gitDirPath);
        } catch (gitError) {
            spinner.warn(`Skipping ${displayName} (no .git directory found in ${targetDir}).`);
            return true; // 不是 Git 仓库，跳过，不算失败
        }

        const targetHooksDir = path.join(gitDirPath, 'hooks');

        // 确保目标 hooks 目录存在
        await fs.mkdir(targetHooksDir, { recursive: true });

        // 读取源 hooks 文件
        const hookFiles = await fs.readdir(sourceHooksDir);
        let installedCount = 0;
        let hasError = false;

        for (const hookFile of hookFiles) {
             // 过滤掉 .DS_Store 等隐藏文件
            if (hookFile.startsWith('.')) {
                continue;
            }
            const sourceHookPath = path.join(sourceHooksDir, hookFile);
            const targetHookPath = path.join(targetHooksDir, hookFile);

            try {
                const hookStat = await fs.stat(sourceHookPath);
                if (!hookStat.isFile()) continue; // 只复制文件

                await fs.copyFile(sourceHookPath, targetHookPath);
                await fs.chmod(targetHookPath, 0o755); // 设置 rwxr-xr-x 权限
                installedCount++;
            } catch (hookError) {
                spinner.fail(`Error installing hook ${hookFile} for ${displayName}: ${(hookError as Error).message}`);
                hasError = true;
                success = false; // 标记整个目录处理失败
            }
        }

        if (!hasError && installedCount > 0) {
            spinner.succeed(`Installed ${installedCount} hooks for ${displayName}`);
        } else if (!hasError && hookFiles.filter(f => !f.startsWith('.')).length === 0) {
             spinner.warn(`No source hook files found to install for ${displayName}`);
        } else if (!hasError && installedCount === 0) {
             spinner.warn(`Processed ${displayName}, but no hook files were installed (check source directory and file types).`);
        } // 如果 hasError 为 true，错误信息已由 spinner.fail 输出

    } catch (dirError: unknown) {
        // 处理访问目标目录或读取状态时的错误
        if ((dirError as {code?: string}).code === 'ENOENT') {
             spinner.fail(`Error processing ${displayName}: Directory not found at ${targetDir}`);
        } else {
             spinner.fail(`Error processing ${displayName}: ${(dirError as Error).message || '未知错误'}`);
        }
        success = false; // 标记整个目录处理失败
    }
    return success;
}


/**
 * 安装 hooks 到主工程和 devModules 下的子模块 (根据 airone.json)
 */
async function installHooks() {
    const sourceHooksDir = path.resolve(__dirname, '../githooks');

    spinner.start(`Checking source hooks directory: ${sourceHooksDir}`);
    try {
        await fs.access(sourceHooksDir);
        spinner.succeed(`Source hooks directory found: ${sourceHooksDir}`);
    } catch (error) {
        spinner.fail(`Error: Source githooks directory not found at ${sourceHooksDir}`);
        console.error('Please ensure the githooks directory exists at dist/githooks relative to the package root after build.');
        process.exit(1);
    }

    // --- 读取项目配置 (仅用于获取 devModules) ---
    spinner.start(`Reading project configuration from ${PROJECT_CONFIG_PATH}`);
    const projectConfig = loadProjectConfig(PROJECT_CONFIG_PATH);

    if (!projectConfig) {
        spinner.warn(`Project config file not found or invalid: ${PROJECT_CONFIG_PATH}. Will only attempt to install hooks in the main project.`);
        // 不退出，允许只为主工程安装
    } else {
      spinner.succeed(`Project config loaded from ${PROJECT_CONFIG_PATH}.`);
    }

    // --- 开始安装 ---
    let overallSuccess = true;

    // 1. 安装到主工程
    spinner.info('Attempting to install hooks for the main project...');
    const mainProjectSuccess = await installHooksToDirectory(PROJECT_DIR, 'main project', sourceHooksDir);
    if (!mainProjectSuccess) {
        overallSuccess = false;
    }

    // 2. 安装到 devModules
    if (projectConfig && projectConfig.devModules && projectConfig.devModules.length > 0) {
        spinner.info(`Starting hook installation for ${projectConfig.devModules.length} devModules...`);
        for (const module of projectConfig.devModules) {
            const moduleName = module.name;
            // 确保模块名不包含可能导致路径遍历的字符，例如 '..'
            if (moduleName.includes('..')) {
                spinner.warn(`Skipping module "${moduleName}" due to invalid characters.`);
                continue;
            }
            const modulePath = path.join(PROJECT_DIR, 'devModules', moduleName);
            const moduleSuccess = await installHooksToDirectory(modulePath, `module: ${moduleName}`, sourceHooksDir);
            if (!moduleSuccess) {
                overallSuccess = false; // 标记整体失败
            }
        }
    } else if (projectConfig) {
        spinner.info(`No 'devModules' found in ${PROJECT_CONFIG_PATH}. Skipping devModules installation.`);
    } // 如果 projectConfig 不存在，前面已经有警告了

    // --- 总结 ---
    if (overallSuccess) {
      spinner.succeed('Hook installation process completed successfully.');
    } else {
      spinner.fail('Hook installation process completed with some errors. Please review the output above.');
      process.exitCode = 1; // Indicate failure
    }
} 