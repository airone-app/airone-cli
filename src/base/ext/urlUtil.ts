 /**
 * Copyright (c) jiayoubao, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * UrlUtil url 操作工具类
 *
 * @author luochenxun(luochenxun@gmail.com)
 * @version 1.0.0
 * 2020-12-16 21:06:57
 *
 */

import * as urlLib from 'url';
import URLSearchParams from 'url-search-params'

interface UrlUtil {

  /**
   * @description 获取 url 中参数
   * @param {string} url
   * @returns {object}
   *
   * @author luochenxun(luochenxun@gmail.com)
   * @date 2020-05-05
   */
  getParams: (url: string) => object | null

  /**
 * @description 去掉 url 中的参数
 * @param {string} url
 * @returns {object}
 *
 * @author luochenxun(luochenxun@gmail.com)
 * @date 2020-05-05
 */
  removeParam: (url: string, paramKey: string) => string

  /**
   *
   * @description 给url添加参数
   * @param {string} url
   * @param {object} params
   * @returns {string | null} null表示失败
   */
  addParams: (url: string, params: object) => string


  /**
  *
  * @description 给url添加参数
  * @param {string} url
  * @param {string} key
  * @param {string} value
  * @returns {string | null} null表示失败
  */
  addParam: (url: string, key: string, value: string) => string
}

interface UrlUtilPrivate {
  _getURLSearchParams: (url: string) => URLSearchParams | null
}

/**
 * urlUtil url操作工具类
 */
const UrlUtil: UrlUtil & UrlUtilPrivate = {

  removeParam: (url: string, paramKey: string): string => {
    const urlObject = urlLib.parse(url)
    let query: string | null = urlObject.query
    if (query != null) {
      const urlParams = new URLSearchParams(query)

      if (urlParams.has(paramKey)) {
        urlParams.delete(paramKey)
      }

      query = urlParams.toString();
    }

    if (query == null || query.length == 0) {
      return url.split('?')[0]
    }
    return url.split('?')[0] + '?' + query;
  },

  _getURLSearchParams: (url: string): URLSearchParams | null => {
    if (url != null) {
      const urlObject = urlLib.parse(url)
      const query = urlObject.query

      if (query != null) {
        return new URLSearchParams(query)
      }
    }

    return null
  },

  getParams: (url: string): object | null => {
    const params = {} as any
    const urlParams = UrlUtil._getURLSearchParams(url)

    if (urlParams != null) {
      urlParams.forEach((value: string, key: string) => {
        params[key] = value;
      });
    }

    return params
  },

  addParams: (url: string, params: any): string => {
    // param check
    if (url == null || params == null) {
      return url
    }

    const urlObject = urlLib.parse(url)

    let query = urlObject.query

    if (query != null) {
      const urlParams = new URLSearchParams(query)

      Object.keys(params).forEach(function (key) {
        if (urlParams.has(key)) {
          urlParams.set(key, params[key])
        } else {
          urlParams && urlParams.append(key, params[key]);
        }
      });

      query = urlParams.toString();
    } else if (params) {
      const urlParams = new URLSearchParams()

      Object.keys(params).forEach(function (key) {
        if (urlParams.has(key)) {
          urlParams.set(key, params[key])
        } else {
          urlParams && urlParams.append(key, params[key]);
        }
      });

      query = urlParams.toString();
    }

    return url.split('?')[0] + '?' + query;
  },

  addParam: (url: string, key: string, value: string): string => {
    return UrlUtil.addParams(url, { key, value });
  }

}


export default UrlUtil;