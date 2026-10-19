# PollingService 测试说明

## 测试文件

- `PollingServiceImpl.test.ts` - PollingService 核心功能测试（共 20+ 个测试用例）
- `../adapters/__tests__/InvoiceStatusValidatorAdapter.test.ts` - 适配器测试

## 运行测试

```bash
# 运行所有 PollingService 相关测试
npm test services/PollingService

# 运行特定测试文件
npm test PollingServiceImpl.test.ts

# 运行特定测试套件
npm test -- --grep "start"
```

## 测试覆盖范围

### PollingServiceImpl 测试

#### 1. **启动和停止** (4 个测试)
   - ✅ 开始轮询并立即执行一次扫描
   - ✅ 设置定时轮询（验证轮询间隔正确执行）
   - ✅ 防止重复启动（警告并忽略）
   - ✅ 停止轮询并清理定时器（验证定时器被正确清理）
   - ✅ 安全地多次调用 stop（幂等性）

#### 2. **状态管理** (3 个测试)
   - ✅ isRunning() 状态检查（未启动、启动后、停止后）
   - ✅ getStatus() 状态获取（包含 isRunning、startTime、elapsedTime）
   - ✅ 记录开始时间（验证 startTime 被正确设置）

#### 3. **轮询逻辑** (4 个测试)
   - ✅ shouldStop 为 true 时停止并调用 onSuccess
   - ✅ shouldContinue 为 true 时继续轮询
   - ✅ shouldContinue 为 false 时停止轮询（不调用 onSuccess 或 onTimeout）
   - ✅ shouldContinue 为 undefined 时继续轮询（默认行为）

#### 4. **超时处理** (2 个测试)
   - ✅ 超时后停止轮询并调用 onTimeout（通过 setTimeout）
   - ✅ executePoll 中检查超时（在每次轮询时检查）

#### 5. **错误处理** (3 个测试)
   - ✅ 扫描错误时调用 onError 回调并继续轮询
   - ✅ 没有 onError 回调时记录错误但继续轮询（使用 console.error）
   - ✅ 验证错误时继续轮询（验证抛出错误被捕获）

#### 6. **任务名称** (2 个测试)
   - ✅ 使用配置中的任务名称（自定义任务名称）
   - ✅ 默认任务名称（当 taskName 为 undefined 时使用 "Polling"）

#### 7. **完整流程** (2 个测试)
   - ✅ 从开始到成功的完整流程（模拟多次轮询直到成功）
   - ✅ 超时场景处理（模拟永远不成功的情况）

## 测试技术

### 核心工具
- **vitest** - 测试框架
- **vi.useFakeTimers()** - 模拟时间，控制定时器执行
- **vi.fn()** - 创建 mock 函数，支持类型推断
- **vi.spyOn()** - 监听 console 方法调用

### 时间控制
- **vi.advanceTimersByTimeAsync()** - 推进指定时间（推荐，避免触发超时）
- **vi.runAllTimersAsync()** - 执行所有定时器（注意：会触发超时定时器）

### Mock 策略
- 使用 `Mock<[], Promise<string>>` 等类型化 mock
- `mockResolvedValue()` - 模拟异步成功
- `mockRejectedValue()` - 模拟异步失败
- `mockReturnValue()` - 模拟同步返回值
- `mockImplementation()` - 自定义实现逻辑

### 测试模式
- **Arrange-Act-Assert (AAA)** - 标准测试结构
- 每个测试独立，使用 `beforeEach` 和 `afterEach` 清理
- 使用 `createPollingService` 辅助函数创建测试实例

## 注意事项

1. **时间控制**：使用 `vi.advanceTimersByTimeAsync()` 时要注意超时时间，避免意外触发超时
2. **异步操作**：所有涉及定时器的测试都需要使用 `await` 等待异步操作完成
3. **Mock 清理**：使用 `vi.clearAllMocks()` 和 `vi.useRealTimers()` 确保测试之间不相互影响
4. **console 调用**：`console.log` 和 `console.warn` 只接收一个参数（模板字符串），测试时需要使用 `expect.stringMatching()` 匹配

