/**
 * Copyright (c) jiayoubao, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ArrayUtil 关于 JS 中 Array 及相关类型操作工具类
 *
 * @author luochenxun(luochenxun@gmail.com)
 * @version 1.0.0
 * 2020-12-16 21:06:57
 *
 */

interface ArrayUtil {
  /**
   * @description 判断传入参数类型是否是数组
   * @param {object} obj
   * @returns {boolean} 数组返回true, 否则为false
   * @author luochenxun
   * @date 2020-05-05
   */
  isArray: (obj: object | undefined) => boolean;

  /**
   * @description 删除数组中特定的元素
   * @param {Array} array 要操作的数组
   * @param {Object} obj 要删除的元素
   * @return {number} 所删除的元素在数组中index, -1 为没找着
   * @author luochenxun
   * @date 2020-05-05
   */
  remove: (array: Array<Object>, obj: Object) => number;
}

// interface ArrayUtilPrivate {
// }

/**
 *  ArrayUtil 关于JS中Object及相关类型操作工具类
 */
const ArrayUtil: ArrayUtil = {
  isArray: (obj: object | undefined): boolean => {
    return obj instanceof Array;
  },

  remove: (array: Array<Object>, obj: Object): number => {
    if (!ArrayUtil.isArray(array)) {
      return -1;
    }

    var index = array.indexOf(obj);
    if (index > -1) {
      array.splice(index, 1);
      return index
    }

    return -1
  },
};

export default ArrayUtil;
