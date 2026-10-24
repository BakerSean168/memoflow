import { describe, expect, it } from 'vitest';
import { TokenUsage } from '../token-usage';

describe('TokenUsage Value Object', () => {
  describe('创建与初始化', () => {
    it('计算总 token 数（未指定时）', () => {
      const usage = TokenUsage.create({
        promptTokens: 120,
        completionTokens: 30,
      });

      expect(usage.promptTokens).toBe(120);
      expect(usage.completionTokens).toBe(30);
      expect(usage.totalTokens).toBe(150);
    });

    it('使用指定的总 token 数', () => {
      const usage = TokenUsage.create({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 200, // 手动指定（可能为了修正或历史原因）
      });

      expect(usage.totalTokens).toBe(200);
    });

    it('零值初始化', () => {
      const usage = TokenUsage.zero();

      expect(usage.promptTokens).toBe(0);
      expect(usage.completionTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.isZero()).toBe(true);
    });

    it('处理极端值', () => {
      const usage = TokenUsage.create({
        promptTokens: 1000000,
        completionTokens: 999999,
      });

      expect(usage.totalTokens).toBe(1999999);
    });
  });

  describe('DTO 转换', () => {
    it('从 Server DTO 创建', () => {
      const dto = {
        promptTokens: 50,
        completionTokens: 25,
        totalTokens: 75,
      };

      const usage = TokenUsage.fromDTO(dto);

      expect(usage.promptTokens).toBe(50);
      expect(usage.completionTokens).toBe(25);
      expect(usage.totalTokens).toBe(75);
    });

    it('转换为 Server DTO', () => {
      const usage = TokenUsage.create({
        promptTokens: 80,
        completionTokens: 20,
      });

      const dto = usage.toDTO();

      expect(dto).toEqual({
        promptTokens: 80,
        completionTokens: 20,
        totalTokens: 100,
      });
    });

    it('DTO 转换往返一致性', () => {
      const original = TokenUsage.create({
        promptTokens: 123,
        completionTokens: 456,
      });

      const dto = original.toDTO();
      const restored = TokenUsage.fromDTO(dto);

      expect(restored.promptTokens).toBe(original.promptTokens);
      expect(restored.completionTokens).toBe(original.completionTokens);
      expect(restored.totalTokens).toBe(original.totalTokens);
    });
  });

  describe('token 合并与累计', () => {
    it('合并两个 token 使用', () => {
      const usage1 = TokenUsage.create({
        promptTokens: 100,
        completionTokens: 50,
      });
      const usage2 = TokenUsage.create({
        promptTokens: 75,
        completionTokens: 25,
      });

      const combined = usage1.add(usage2);

      expect(combined.promptTokens).toBe(175);
      expect(combined.completionTokens).toBe(75);
      expect(combined.totalTokens).toBe(250);
    });

    it('合并零值', () => {
      const usage = TokenUsage.create({
        promptTokens: 50,
        completionTokens: 25,
      });
      const zero = TokenUsage.zero();

      const result = usage.add(zero);

      expect(result.promptTokens).toBe(50);
      expect(result.completionTokens).toBe(25);
      expect(result.totalTokens).toBe(75);
    });

    it('链式合并多个 token', () => {
      const usage1 = TokenUsage.create({ promptTokens: 10, completionTokens: 5 });
      const usage2 = TokenUsage.create({ promptTokens: 20, completionTokens: 10 });
      const usage3 = TokenUsage.create({ promptTokens: 30, completionTokens: 15 });

      const combined = usage1.add(usage2).add(usage3);

      expect(combined.promptTokens).toBe(60);
      expect(combined.completionTokens).toBe(30);
      expect(combined.totalTokens).toBe(90);
    });

    it('原始对象在合并后保持不变', () => {
      const usage1 = TokenUsage.create({
        promptTokens: 100,
        completionTokens: 50,
      });
      const usage2 = TokenUsage.create({
        promptTokens: 75,
        completionTokens: 25,
      });

      usage1.add(usage2);

      // 原始对象应保持不变（不变性）
      expect(usage1.promptTokens).toBe(100);
      expect(usage1.completionTokens).toBe(50);
      expect(usage1.totalTokens).toBe(150);
    });
  });

  describe('零值检查', () => {
    it('零值返回 true', () => {
      const zero = TokenUsage.zero();
      expect(zero.isZero()).toBe(true);
    });

    it('非零值返回 false', () => {
      const usage = TokenUsage.create({
        promptTokens: 1,
        completionTokens: 0,
      });
      expect(usage.isZero()).toBe(false);
    });

    it('仅完成 token 的情况', () => {
      const usage = TokenUsage.create({
        promptTokens: 0,
        completionTokens: 1,
      });
      expect(usage.isZero()).toBe(false);
    });
  });

  describe('限制检查', () => {
    it('低于限制返回 false', () => {
      const usage = TokenUsage.create({
        promptTokens: 40,
        completionTokens: 20, // totalTokens = 60
      });

      expect(usage.exceedsLimit(60)).toBe(false); // 60 == 60，不超过
      expect(usage.exceedsLimit(70)).toBe(false); // 60 < 70，不超过
      expect(usage.exceedsLimit(100)).toBe(false);
    });

    it('达到限制返回 false', () => {
      const usage = TokenUsage.create({
        promptTokens: 40,
        completionTokens: 20,
      });

      expect(usage.exceedsLimit(60)).toBe(false); // 60 == 60 不超过
    });

    it('超过限制返回 true', () => {
      const usage = TokenUsage.create({
        promptTokens: 40,
        completionTokens: 20,
      });

      expect(usage.exceedsLimit(50)).toBe(true);
      expect(usage.exceedsLimit(59)).toBe(true);
    });

    it('累计使用超过限制', () => {
      const usage1 = TokenUsage.create({
        promptTokens: 40,
        completionTokens: 20,
      });
      const usage2 = TokenUsage.create({
        promptTokens: 35,
        completionTokens: 15,
      });

      const combined = usage1.add(usage2);

      expect(combined.exceedsLimit(100)).toBe(true); // 110 > 100
      expect(combined.exceedsLimit(110)).toBe(false); // 110 == 110
    });

    it('零限制的边界情况', () => {
      const usage = TokenUsage.create({
        promptTokens: 1,
        completionTokens: 0,
      });

      expect(usage.exceedsLimit(0)).toBe(true);
    });
  });

  describe('值对象不变性与相等性', () => {
    it('相同值创建的实例不是引用相等', () => {
      const usage1 = TokenUsage.create({
        promptTokens: 100,
        completionTokens: 50,
      });
      const usage2 = TokenUsage.create({
        promptTokens: 100,
        completionTokens: 50,
      });

      // 值对象通常支持值比较，不是引用比较
      expect(usage1).not.toBe(usage2); // 不同引用
      // 但属性值相同
      expect(usage1.promptTokens).toBe(usage2.promptTokens);
      expect(usage1.completionTokens).toBe(usage2.completionTokens);
      expect(usage1.totalTokens).toBe(usage2.totalTokens);
    });
  });

  describe('数学运算精度', () => {
    it('避免浮点数误差（假设都是整数）', () => {
      const usage = TokenUsage.create({
        promptTokens: 0.1,
        completionTokens: 0.2,
      } as any);

      // 如果允许浮点数，确保精度
      expect(usage.totalTokens).toBeCloseTo(0.3, 5);
    });

    it('大数字合并的准确性', () => {
      const usage1 = TokenUsage.create({
        promptTokens: 999999999,
        completionTokens: 999999999,
      });
      const usage2 = TokenUsage.create({
        promptTokens: 1,
        completionTokens: 1,
      });

      const combined = usage1.add(usage2);

      expect(combined.promptTokens).toBe(1000000000);
      expect(combined.completionTokens).toBe(1000000000);
      expect(combined.totalTokens).toBe(2000000000);
    });
  });
});
