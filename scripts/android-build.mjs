import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = process.cwd()
const androidRoot = join(projectRoot, 'android')
const windows = process.platform === 'win32'
const defaultSdk = windows
  ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
  : join(process.env.HOME ?? '', 'Library', 'Android', 'sdk')
const defaultJdk = windows
  ? 'C:\\Program Files\\Android\\Android Studio\\jbr'
  : process.env.JAVA_HOME
const sdkRoot = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME ?? defaultSdk
const jdkRoot =
  windows && defaultJdk && existsSync(defaultJdk)
    ? defaultJdk
    : process.env.JAVA_HOME ?? defaultJdk

if (!sdkRoot || !existsSync(sdkRoot)) {
  throw new Error('Android SDK not found. Install Android Studio or set ANDROID_SDK_ROOT.')
}
if (!jdkRoot || !existsSync(jdkRoot)) {
  throw new Error('JDK not found. Install Android Studio or set JAVA_HOME to JDK 21.')
}

const run = (command, args, cwd = projectRoot) => {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      JAVA_HOME: jdkRoot,
      ANDROID_HOME: sdkRoot,
      ANDROID_SDK_ROOT: sdkRoot,
    },
    stdio: 'inherit',
  })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const npmCli = process.env.npm_execpath
const capCli = join(projectRoot, 'node_modules', '@capacitor', 'cli', 'dist', 'index.js')

if (!npmCli || !existsSync(npmCli)) throw new Error('npm CLI path not found.')
run(process.execPath, [npmCli, 'run', 'build'])
run(process.execPath, [capCli, 'sync', 'android'])

if (windows) {
  run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gradlew.bat', 'assembleDebug'], androidRoot)
} else {
  run('./gradlew', ['assembleDebug'], androidRoot)
}
