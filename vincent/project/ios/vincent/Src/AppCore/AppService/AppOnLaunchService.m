//
// AppOnLaunchService.m
// AirOne
//
// Created by luochenxun(luochenxun@gmail.com) on 2019-06-13
// Copyright (c) 2019年 airone. All rights reserved.

#import "AppOnLaunchService.h"
#import "AirNetworkAFImpl.h"
#import "AirNetworkConfig.h"
#import "ZZCRequest.h"
#import "ZZCLogInterceptor.h"
#import "ZZCEncryptInterceptor.h"

@implementation AppOnLaunchService



#pragma mark - < Override Methods >

+ (void)load {
    [AppServiceManager registerService:[AppOnLaunchService new]];
}

+ (NSString *)serviceName {
    return [AppOnLaunchService className];
}

- (AppServicePriority)servicePriority{
    return AppServicePriorityHight;
}

- (BOOL)application:(UIApplication *)application willFinishLaunchingWithOptions:(NSDictionary *)launchOptions{
    
    NSLog(@"Test Service Launch...");
    
    return YES;
}





#pragma mark - < Main Logic >


// 初始化网络
- (void)setupNetwork
{
    // 网络配置
    AirNetworkConfig *networkConfig = [AirNetworkConfig defaultConfig];
    networkConfig.headerFields = @{
                                   @"Host": @"cdnsit.jyblife.com",
                                   @"User-Agent": @"jiayoubao-alpha/6.3.0 (x86_64; iOS 12.1)"
                                   };
    AirNetworkAFImpl *networkImpl = [[AirNetworkAFImpl alloc] initWithConfig:networkConfig];
    [ZZCRequest setNetworkImpl:networkImpl];
    
    // 初始化中间件
    ZZCLogInterceptor *logInterceptor = [ZZCLogInterceptor new];
    ZZCEncryptInterceptor *encryInterceptor = [[ZZCEncryptInterceptor alloc] initWitSignKey:@"JP6e907nKVQiUTJf1xLB49Styp"];
    [ZZCRequest setBasicInterceptors:@[
                                       logInterceptor,
                                       encryInterceptor,
                                       ]];
}


#pragma mark - < Delegate Methods >


#pragma mark - < Private Methods >


#pragma mark - < Lazy Initialize Methods >


@end
