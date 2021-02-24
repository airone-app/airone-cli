/**
 * Copyright (c) jiayoubao, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * NumberUtil number对象操作工具类
 *
 * @author luochenxun(luochenxun@gmail.com)
 * @version 1.0.0
 * 2020-12-16 21:06:57
 *
 */

interface NumberUtil {

  /**
   * @description 将输入转成 int 类型
   * @param {string} value
   * @returns {number} 如果失败都为0
   * @author luochenxun
   * @date 2020-05-05
   */
  parseIntSafe: (value?: string) => number

    /**
   * @description 将输入转成 float 类型
   * @param {string} value
   * @returns {number} 如果失败都为0
   * @author luochenxun
   * @date 2020-05-05
   */
  parseFloatSafe: (value?: string) => number
}

// interface NumberUtilPrivate {
// }

/**
 *  NumberUtil number对象操作工具类
 */
const NumberUtil: NumberUtil = {

  parseIntSafe: (value?: string): number => {
    if (value == undefined) {
      return 0;
    }
    return parseInt(value) || 0;
  },

  parseFloatSafe: (value?: string): number => {
    if (value == undefined) {
      return 0;
    }
    return parseFloat(value) || 0.0;
  }

}


export default NumberUtil;