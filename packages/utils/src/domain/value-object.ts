import { isEqual } from 'lodash-es';

interface ValueObjectProps {
  [index: string]: any;
}

/**
 * @desc ValueObject 基类
 * @param T - 值对象内部属性的接口定义
 */
export abstract class ValueObject<T extends ValueObjectProps> {
  public readonly props: T;

  protected constructor(props: T) {
    // 1. 保证不可变性：冻结属性，防止外部修改
    // Object.freeze 只能冻结一层，如果 props 内部还有对象，建议使用递归冻结或 Immer
    this.props = Object.freeze({ ...props });
  }

  /**
   * 核心逻辑：结构性相等检查
   */
  public equals(vo?: ValueObject<T>): boolean {
    if (vo === null || vo === undefined) {
      return false;
    }

    // 1. 引用相等 (同一个内存地址)
    if (vo === this) {
      return true;
    }

    // 2. 必须是同一个类
    if (vo.constructor !== this.constructor) {
      return false;
    }

    // 3. 比较内部属性
    // 这里有两个策略：
    // 策略 A (推荐): 使用 Lodash 的 isEqual 进行深度比较 (最省心)
    return isEqual(this.props, vo.props);

    // 策略 B (手动实现): 简单的 JSON 序列化比较 (有属性顺序问题的风险，但在大多数简单 VO 场景够用)
    // return JSON.stringify(this.props) === JSON.stringify(vo.props);
  }

  /**
   * 获取原始属性副本 (用于序列化或持久化)
   */
  public getRawProps(): T {
    return { ...this.props };
  }
}
