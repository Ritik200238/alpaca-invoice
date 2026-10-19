import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { PollingService } from '../PollingServiceImpl';
import { PollingConfig, PollingCallbacks, ValidationResult } from '../IPollingService';

describe('PollingServiceImpl', () => {
  let mockScan: Mock<[], Promise<string>>;
  let mockValidate: Mock<[result: string], ValidationResult>;
  let mockOnSuccess: Mock<[result: string], Promise<void>>;
  let mockOnTimeout: Mock<[], Promise<void>>;
  let mockOnError: Mock<[error: Error], void>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockScan = vi.fn<[], Promise<string>>();
    mockValidate = vi.fn<[result: string], ValidationResult>();
    mockOnSuccess = vi.fn<[result: string], Promise<void>>().mockResolvedValue(undefined);
    mockOnTimeout = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
    mockOnError = vi.fn<[error: Error], void>();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const createPollingService = (
    config: Partial<PollingConfig<string>> = {},
    callbacks: Partial<PollingCallbacks<string>> = {}
  ): PollingService<string> => {
    const defaultConfig: PollingConfig<string> = {
      pollInterval: 1000,
      pollTimeout: 5000,
      taskName: 'Test Polling',
      ...config
    };

    const defaultCallbacks: PollingCallbacks<string> = {
      scan: mockScan,
      validate: mockValidate,
      onSuccess: mockOnSuccess,
      onTimeout: mockOnTimeout,
      onError: mockOnError,
      ...callbacks
    };

    return new PollingService(defaultConfig, defaultCallbacks);
  };

  describe('start', () => {
    it('应该开始轮询并立即执行一次扫描', async () => {
      // Arrange
      mockScan.mockResolvedValue('scan-result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue polling' });
      const service = createPollingService();

      // Act
      service.start();

      // Assert
      expect(service.isRunning()).toBe(true);
      expect(mockScan).toHaveBeenCalledTimes(1);
      
      // 等待异步操作完成
      await vi.runAllTimersAsync();
    });

    it('应该设置定时轮询', async () => {
      // Arrange
      mockScan.mockResolvedValue('scan-result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService({ pollInterval: 1000 });

      // Act
      service.start();
      await vi.advanceTimersByTimeAsync(2500); // 2.5秒，应该执行3次（立即1次 + 2次定时）

      // Assert
      expect(mockScan).toHaveBeenCalledTimes(3);
    });

    it('如果已经在运行，应该警告并忽略重复启动', () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockScan.mockResolvedValue('scan-result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService();

      // Act
      service.start();
      service.start(); // 第二次启动

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[PollingService\].*already running/)
      );
      expect(service.isRunning()).toBe(true);
      
      consoleSpy.mockRestore();
    });

    it('应该记录开始时间', () => {
      // Arrange
      mockScan.mockResolvedValue('scan-result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService();

      // Act
      service.start();
      const status = service.getStatus();

      // Assert
      expect(status.startTime).not.toBeNull();
      expect(status.startTime).toBeGreaterThan(0);
    });
  });

  describe('stop', () => {
    it('应该停止轮询并清理定时器', async () => {
      // Arrange
      mockScan.mockResolvedValue('scan-result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService();
      service.start();

      // Act
      service.stop();

      // Assert
      expect(service.isRunning()).toBe(false);
      expect(service.getStatus().startTime).toBeNull();
      
      // 验证定时器已清理：继续推进时间不应该再执行扫描
      const callCountBefore = mockScan.mock.calls.length;
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScan.mock.calls.length).toBe(callCountBefore);
    });

    it('应该能够安全地多次调用 stop', () => {
      // Arrange
      mockScan.mockResolvedValue('scan-result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService();
      service.start();

      // Act
      service.stop();
      service.stop(); // 第二次停止

      // Assert
      expect(service.isRunning()).toBe(false);
    });
  });

  describe('isRunning', () => {
    it('应该在未启动时返回 false', () => {
      // Arrange
      const service = createPollingService();

      // Act & Assert
      expect(service.isRunning()).toBe(false);
    });

    it('应该在启动后返回 true', () => {
      // Arrange
      mockScan.mockResolvedValue('scan-result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService();

      // Act
      service.start();

      // Assert
      expect(service.isRunning()).toBe(true);
    });

    it('应该在停止后返回 false', () => {
      // Arrange
      mockScan.mockResolvedValue('scan-result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService();
      service.start();

      // Act
      service.stop();

      // Assert
      expect(service.isRunning()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('应该在未启动时返回正确的状态', () => {
      // Arrange
      const service = createPollingService();

      // Act
      const status = service.getStatus();

      // Assert
      expect(status.isRunning).toBe(false);
      expect(status.startTime).toBeNull();
      expect(status.elapsedTime).toBeNull();
    });

    it('应该在启动后返回正确的状态', async () => {
      // Arrange
      mockScan.mockResolvedValue('scan-result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService();

      // Act
      service.start();
      await vi.advanceTimersByTimeAsync(1000);
      const status = service.getStatus();

      // Assert
      expect(status.isRunning).toBe(true);
      expect(status.startTime).not.toBeNull();
      expect(status.elapsedTime).not.toBeNull();
      expect(status.elapsedTime).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('轮询逻辑', () => {
    it('当验证结果 shouldStop 为 true 时，应该停止轮询并调用 onSuccess', async () => {
      // Arrange
      const scanResult = 'success-result';
      mockScan.mockResolvedValue(scanResult);
      mockValidate.mockReturnValue({ shouldStop: true, reason: 'Success' });
      const service = createPollingService();

      // Act
      service.start();
      await vi.runAllTimersAsync();

      // Assert
      expect(mockValidate).toHaveBeenCalledWith(scanResult);
      expect(mockOnSuccess).toHaveBeenCalledWith(scanResult);
      expect(service.isRunning()).toBe(false);
    });

    it('当验证结果 shouldStop 为 false 且 shouldContinue 为 true 时，应该继续轮询', async () => {
      // Arrange
      mockScan.mockResolvedValue('result');
      mockValidate.mockReturnValue({ 
        shouldStop: false, 
        reason: 'Continue', 
        shouldContinue: true 
      });
      const service = createPollingService({ pollInterval: 500 });

      // Act
      service.start();
      await vi.advanceTimersByTimeAsync(1500); // 1.5秒，应该执行多次

      // Assert
      expect(mockScan).toHaveBeenCalledTimes(4); // 立即1次 + 3次定时
      expect(service.isRunning()).toBe(true);
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });

    it('当验证结果 shouldContinue 为 false 时，应该停止轮询', async () => {
      // Arrange
      mockScan.mockResolvedValue('result');
      mockValidate.mockReturnValue({ 
        shouldStop: false, 
        reason: 'Stop', 
        shouldContinue: false 
      });
      const service = createPollingService();

      // Act
      service.start();
      await vi.runAllTimersAsync();

      // Assert
      expect(service.isRunning()).toBe(false);
      expect(mockOnSuccess).not.toHaveBeenCalled();
      expect(mockOnTimeout).not.toHaveBeenCalled();
    });

    it('当验证结果 shouldContinue 为 undefined 时，应该继续轮询', async () => {
      // Arrange
      mockScan.mockResolvedValue('result');
      mockValidate.mockReturnValue({ 
        shouldStop: false, 
        reason: 'Continue' 
        // shouldContinue 未定义
      });
      const service = createPollingService({ pollInterval: 500 });

      // Act
      service.start();
      await vi.advanceTimersByTimeAsync(1500);

      // Assert
      expect(mockScan).toHaveBeenCalledTimes(4);
      expect(service.isRunning()).toBe(true);
    });
  });

  describe('超时处理', () => {
    it('应该在超时后停止轮询并调用 onTimeout', async () => {
      // Arrange
      mockScan.mockResolvedValue('result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService({ 
        pollInterval: 1000, 
        pollTimeout: 5000 
      });

      // Act
      service.start();
      await vi.advanceTimersByTimeAsync(5000); // 达到超时时间

      // Assert
      expect(mockOnTimeout).toHaveBeenCalledTimes(1);
      expect(service.isRunning()).toBe(false);
    });

    it('应该在 executePoll 中检查超时', async () => {
      // Arrange
      mockScan.mockResolvedValue('result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService({ 
        pollInterval: 1000, 
        pollTimeout: 3000 
      });

      // Act
      service.start();
      await vi.advanceTimersByTimeAsync(3000);

      // Assert
      expect(mockOnTimeout).toHaveBeenCalled();
      expect(service.isRunning()).toBe(false);
    });
  });

  describe('错误处理', () => {
    it('当扫描抛出错误时，应该调用 onError 回调并继续轮询', async () => {
      // Arrange
      const error = new Error('Scan failed');
      mockScan.mockRejectedValue(error);
      const service = createPollingService({ pollInterval: 500 });

      // Act
      service.start();
      await vi.advanceTimersByTimeAsync(1500);

      // Assert
      expect(mockOnError).toHaveBeenCalledWith(error);
      expect(service.isRunning()).toBe(true); // 应该继续运行
    });

    it('当没有提供 onError 回调时，应该记录错误但继续轮询', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Scan failed');
      mockScan.mockRejectedValue(error);
      const service = createPollingService({ 
        pollInterval: 500 
      }, { 
        onError: undefined 
      });

      // Act
      service.start();
      await vi.advanceTimersByTimeAsync(1500);

      // Assert
      expect(consoleSpy).toHaveBeenCalled();
      expect(service.isRunning()).toBe(true);
      
      consoleSpy.mockRestore();
    });

    it('当验证抛出错误时，应该继续轮询', async () => {
      // Arrange
      mockScan.mockResolvedValue('result');
      const error = new Error('Validation failed');
      mockValidate.mockImplementation(() => {
        throw error;
      });
      // 设置较长的超时时间，避免测试时触发超时
      const service = createPollingService({ 
        pollInterval: 500,
        pollTimeout: 10000 // 10秒超时，确保测试不会触发
      });

      // Act
      service.start();
      // 只推进 2000ms，确保不会触发超时，但会执行几次轮询
      await vi.advanceTimersByTimeAsync(2000);

      // Assert
      // 由于验证抛出错误，executePoll 会捕获并继续
      expect(service.isRunning()).toBe(true);
      // 验证错误被捕获并调用了 onError
      expect(mockOnError).toHaveBeenCalledWith(error);
    });
  });

  describe('任务名称', () => {
    it('应该使用配置中的任务名称', () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockScan.mockResolvedValue('result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService({ taskName: 'Custom Task Name' });

      // Act
      service.start();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[PollingService\].*Custom Task Name/)
      );
      
      consoleSpy.mockRestore();
    });

    it('当没有提供任务名称时，应该使用默认名称', () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockScan.mockResolvedValue('result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Continue' });
      const service = createPollingService({ taskName: undefined });

      // Act
      service.start();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[PollingService\].*Polling/)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('完整轮询流程', () => {
    it('应该完成从开始到成功的完整流程', async () => {
      // Arrange
      let scanCount = 0;
      mockScan.mockImplementation(() => {
        scanCount++;
        // 前两次返回未就绪的结果，第三次返回成功
        if (scanCount < 3) {
          return Promise.resolve('not-ready');
        }
        return Promise.resolve('ready');
      });

      mockValidate.mockImplementation((result) => {
        if (result === 'ready') {
          return { shouldStop: true, reason: 'Ready' };
        }
        return { shouldStop: false, reason: 'Not ready', shouldContinue: true };
      });

      const service = createPollingService({ pollInterval: 500 });

      // Act
      service.start();
      await vi.advanceTimersByTimeAsync(1500); // 等待3次扫描

      // Assert
      expect(mockScan).toHaveBeenCalledTimes(3);
      expect(mockOnSuccess).toHaveBeenCalledWith('ready');
      expect(service.isRunning()).toBe(false);
    });

    it('应该处理超时场景', async () => {
      // Arrange
      mockScan.mockResolvedValue('result');
      mockValidate.mockReturnValue({ shouldStop: false, reason: 'Never ready', shouldContinue: true });
      const service = createPollingService({ 
        pollInterval: 500, 
        pollTimeout: 2000 
      });

      // Act
      service.start();
      await vi.advanceTimersByTimeAsync(2000);

      // Assert
      expect(mockOnTimeout).toHaveBeenCalled();
      expect(service.isRunning()).toBe(false);
    });
  });
});

