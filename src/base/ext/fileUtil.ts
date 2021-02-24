/**
 * Copyright (c) jiayoubao, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * FileUtil 文件管理器
 *
 * @author luochenxun(luochenxun@gmail.com)
 * @version 1.0.0
 * 2020-12-16 21:06:57
 *
 */


interface FileUtil {

  /** Base64 转 File 格式 */
  translateBase64ImgToFile: (base64: string, filename: string, contentType: string) => File

  /** url 转 base64 */
  translateImgToBase64: (url: string, callback: (arg: string) => any) => void
}

/**
 * FileUtil 文件管理器
 */
const FileUtil: FileUtil = {

  translateBase64ImgToFile: (base64: string, filename: string, contentType: string): File => {
    var arr = base64.split(',')  //去掉base64格式图片的头部
    var bstr = atob(arr[1])   //atob()方法将数据解码
    var len = bstr.length
    var u8arr = new Uint8Array(len)
    while (len--) {
      u8arr[len] = bstr.charCodeAt(len) //返回指定位置的字符的 Unicode 编码
    }
    return new File([u8arr], filename, { type: contentType })
  },

  translateImgToBase64(url: string, callback): void {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    const img = new Image  //通过构造函数绘制图片实例
    img.crossOrigin = 'Anonymous'  //处理图片跨域问题，见拓展1
    img.onload = function () {   //该加载过程为异步事件，请先确保获取完整图片
      canvas.width = img.width
      canvas.height = img.height
      context && context.drawImage(img, 0, 0)  //将图片绘制在canvas中
      var URLData = canvas.toDataURL('image/png')
      callback(URLData);
    }
    img.src = url
  }
}


/**
 * FileUtil 文件管理器
 */
export default FileUtil;