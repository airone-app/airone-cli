 /**
 * Copyright (c) jiayoubao, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ObjectUtil 关于JS中Object及相关类型操作工具类
 *
 * @author luochenxun(luochenxun@gmail.com)
 * @version 1.0.0
 * 2020-12-16 21:06:57
 *
 */

import StringUtil from "./stringUtil";

interface ObjectUtil {

  /**
   * @description 判断传入参数类型是否是数组
   * @param {object} obj
   * @returns {boolean} 数组返回true, 否则为false
   * @author luochenxun
   * @date 2020-05-05
   */
  isArray: (obj: object | undefined) => boolean

   /**
   * @description 基于key给对象排序
   * @author luochenxun
   * @date 2020-10-11
   */
  sortObjectByKeys: (obj: any) => Record<string, any>


  /**
   * @description 删除obj中值为空的 key
   * @memberof ObjectUtil
   */
  removeEmptyKeys: (obj: any) => void
}

// interface ObjectUtilPrivate {
// }

/**
 *  ObjectUtil 关于JS中Object及相关类型操作工具类
 */
const ObjectUtil: ObjectUtil = {

  isArray: (obj: object | undefined): boolean => {
    return obj instanceof Array;
  },

  sortObjectByKeys: (obj: any): Record<string, any> => {
    const ordered = {} as any;
    Object.keys(obj).sort().forEach(function (key) {
      ordered[key] = obj[key];
    });
    return ordered;
  },

  removeEmptyKeys: (obj: any) => {
    if (obj == null) {
      return;
    }
    Object.keys(obj).forEach(function (key) {
      if (obj[key] == null || (typeof obj == 'string' && (obj as string).length == 0)) {
        delete obj[key]
      }
    });
  }
}


export default ObjectUtil;