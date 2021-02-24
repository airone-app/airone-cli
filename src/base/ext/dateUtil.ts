/**
 * Copyright (c) jiayoubao, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * 时间处理 Helper
 *
 * @author luochenxun(luochenxun@gmail.com)
 * @version 1.0.0
 * 2020-12-16 21:06:57
 *
 */


interface DateUtil {

  /**
   * @description 返回 UTC（世界标准时间）至今所经过的毫秒数
   * @author luochenxun(luochenxun@gmail.com)
   * @date 2020-10-15
   * @returns {(string | undefined)}
   */
  timestamp: () => string | undefined

  // 将 Date 转化为指定格式的String
  // Format("yyyy-MM-dd hh:mm:ss.S") ==> 2006-07-02 08:09:04.423
  // Format("yyyy-M-d h:m:s.S")      ==> 2006-7-2 8:9:4.18
  currentDateStringWithFormat: (format: string) => string

  // 以基础格式输出当前时间，如： 2006-07-02 08:09:04
  currentDateString: () => string


  /**
   * @description sleep 的异步方法
   * @author luochenxun(luochenxun@gmail.com)
   * @date 2021-01-27
   * @param {number} timeout 毫秒，1000为1s
   * @returns {Promise}
   */
  sleep: (timeout: number) => Promise<void>
}


const DateUtil: DateUtil = {

  /**
   * @description 返回 UTC（世界标准时间）至今所经过的毫秒数
   * @author luochenxun(luochenxun@gmail.com)
   * @date 2020-10-15
   * @returns {(string | undefined)}
   */
  timestamp(): string | undefined {
    return Date.now().toString();
  },

  // 对Date的扩展，将 Date 转化为指定格式的String
  // 月(M)、日(d)、小时(h)、分(m)、秒(s)、季度(q) 可以用 1-2 个占位符，
  // 年(y)可以用 1-4 个占位符，毫秒(S)只能用 1 个占位符(是 1-3 位的数字)
  // 例子：
  // (new Date()).Format("yyyy-MM-dd hh:mm:ss.S") ==> 2006-07-02 08:09:04.423
  // (new Date()).Format("yyyy-M-d h:m:s.S")      ==> 2006-7-2 8:9:4.18
  currentDateStringWithFormat(format: string): string {
    const now = new Date()
    var o = {
      "M+": now.getMonth() + 1,               //月份
      "d+": now.getDate(),                    //日
      "h+": now.getHours(),                   //小时
      "m+": now.getMinutes(),                 //分
      "s+": now.getSeconds(),                 //秒
      "q+": Math.floor((now.getMonth() + 3) / 3), //季度
      "S": now.getMilliseconds()             //毫秒
    } as any;
    if (/(y+)/.test(format))
      format = format.replace(RegExp.$1, (now.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
      if (new RegExp("(" + k + ")").test(format))
        format = format.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return format;
  },

  currentDateString(): string {
    return this.currentDateStringWithFormat('yyyy-MM-dd hh:mm:ss.S')
  },

  sleep(timeout: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve()
      }, timeout);
    })
  }

}

export default DateUtil