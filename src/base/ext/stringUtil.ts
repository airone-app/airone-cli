/**
 * Copyright (c) jiayoubao, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * StringUtil string对象操作工具类
 *
 * @author luochenxun(luochenxun@gmail.com)
 * @version 1.0.0
 * 2020-12-16 21:06:57
 *
 */


interface StringUtil {

  trimAll: (value: string) => string

  /**
   * 判断给定参数是否是字符串
   */
  isString: (value?: any) => boolean

  /**
   * 判断给定字符串变量是否为空
   * @param {*} value
   */
  isEmpty: (value?: string | null) => boolean

  /**
   * 判断是否为正确的手机号
   * @param {*} value
   */
  isPhoneNum: (value: string) => boolean

  /**
   * 判断身份证号是否正确
   */
  isIdentity: (value?: string | null) => boolean

  /**
   * 手机号格式化隐藏中间四位
   * @param {*} value
   */
  formatPhoneNo: (value: string | null) => string

  /**
   * 将分为单位转成元为单位，保留2位小数
   * @param {number | string} amount
   */
  fen2yuan: (amount: number | string) => string

  /**
   * 将分为单位转成元为单位，保留2位小数。如果是整元，去掉末尾的 .00
   * @param {number | string} number
   */
  fen2yuanWithoutZero: (amount: number | string) => string

  /**
   * url 添加get参数
   * @param key
   * @param value
   */
  addParamForUrl: (url: string, key: string, value: string) => string;

  /**
   * ES6: base64解码
   */
  decodeBase64Content: (value: string) => string;

  /**
   * ES6: base64编码
   */
  encodeBase64Content: (value: string) => string;
}

const StringUtil: StringUtil = {

  trimAll: (value: string): string => {
    value = value.replace(/(^\s+)|(\s+$)/g, '');
    value = value.replace(/\s/g, '');
    return value;
  },

  isString: (value?: any): boolean => {
    return value instanceof String;
  },

  isEmpty: (value?: string | null): boolean => {
    if (value == null || typeof value != 'string' || value.length == 0) {
      return true
    }
    return false
  },

  isPhoneNum: (value: string): boolean => {
    const phoneReg = /^(1[0-9][0-9])\d{8}$/;
    if (!phoneReg.test(value)) {
      return false;
    } else {
      return true;
    }
  },

  isIdentity: (id?: string | null): boolean => {
    if (id == null) {
      return false;
    }
    // 1 "验证通过!", 0 //校验不通过
    var format = /^(([1][1-5])|([2][1-3])|([3][1-7])|([4][1-6])|([5][0-4])|([6][1-5])|([7][1])|([8][1-2]))\d{4}(([1][9]\d{2})|([2]\d{3}))(([0][1-9])|([1][0-2]))(([0][1-9])|([1-2][0-9])|([3][0-1]))\d{3}[0-9xX]$/;
    //号码规则校验
    if (!format.test(id)) {
      return false;
    }
    //区位码校验
    //出生年月日校验   前正则限制起始年份为1900;
    const year = id.substr(6, 4), // 身份证年
      month = id.substr(10, 2),   // 身份证月
      date = id.substr(12, 2),    // 身份证日
      time = Date.parse(month + '-' + date + '-' + year),// 身份证日期时间戳date
      now_time = Date.parse(new Date().toString()), // 当前时间戳
      dates = (new Date(parseInt(year), parseInt(month), 0)).getDate(); // 身份证当月天数

    if (time > now_time || parseInt(date) > dates) {
      return false
    }
    //校验码判断
    var c = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];   //系数
    var b = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];  //校验码对照表
    var id_array = id.split("");
    var sum = 0;
    for (var k = 0; k < 17; k++) {
      sum += parseInt(id_array[k]) * c[k];
    }
    if (id_array[17].toUpperCase() != b[sum % 11].toUpperCase()) {
      return false
    }
    return true
  },

  formatPhoneNo: (value: string | null): string => {
    if (value == null) {
      return ''
    }
    return value.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
  },

  fen2yuan: (amount: number | string) => {
    if (typeof amount == 'string') {
      amount = parseInt(amount) || 0
    }

    amount = amount / 100.0
    return String(amount.toFixed(2))
  },

  fen2yuanWithoutZero: (amount: number | string) => {
    if (typeof amount == 'string') {
      amount = parseInt(amount)
    }

    amount = amount / 100.0

    if (String(amount.toFixed(2)).includes('.00')) {
      return String(parseInt(String(amount)));
    }
    return String(amount.toFixed(2))
  },

  addParamForUrl: (url: string, key: string, value: string): string => {
    let newStr: string = url;
    if (url.includes("#")) {
      const splits = url.split("#");
      if (url.indexOf("?") != -1) {
        newStr = splits[0] + "&" + key + "=" + value + splits[1];
      }

      if (url.indexOf("?") == -1) {
        newStr = splits[0] + "?" + key + "=" + value + splits[1];
      }
    } else {
      if (url.indexOf("?") != -1) {
        newStr = url + "&" + key + "=" + value;
      }

      if (url.indexOf("?") == -1) {
        newStr = url + "?" + key + "=" + value;
      }
    }
    return newStr;
  },

  decodeBase64Content: (base64Content: string): string => {
    let commonContent = base64Content.replace(/\s/g, '+');
    commonContent = Buffer.from(commonContent, 'base64').toString();
    return commonContent;
  },

  encodeBase64Content: (commonContent: string): string => {
    let base64Content = Buffer.from(commonContent).toString('base64');
    return base64Content;
  },
};

export default StringUtil;
