/**
 * Copyright (c) jiayoubao, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * SystemUtil 系统工具
 *
 * @author luochenxun(luochenxun@gmail.com)
 * @version 1.0.0
 *
 * 2021-06-25 16:38:55
 *
 */

import * as shelljs from 'shelljs'


/**
 *  NumberUtil number对象操作工具类
 */
class SystemUtil {

  public isCmdRunSuccess(): boolean {
    const result = shelljs.exec('echo $?').trim()
    shelljs.echo('\n\n the result is ==> ', result)
    if (result == '0') {
      return true
    }

    return false
  }

}


export default new SystemUtil();
