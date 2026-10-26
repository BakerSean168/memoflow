/**
 * Goal Mapper
 *
 * 负责 Goal 领域对象与 DTO 之间的转换
 */

import { Goal } from '../../domain';
import type  { GoalClientDTO, GoalServerDTO } from '@memoflow/goal-contracts';

/**
 * Goal Mapper
 */
export class GoalMapper {
  /**
   * 将领域对象转换为客户端 DTO
   */
  static toClientDTO(goal: Goal, includeChildren = false): GoalClientDTO {
    return goal.toClientDTO(includeChildren);
  }

  /**
   * 将领域对象转换为 Server DTO
   */
  static toServerDTO(goal: Goal, includeChildren = true): GoalServerDTO {
    return goal.toServerDTO(includeChildren);
  }

  /**
   * 批量转换为客户端 DTO
   */
  static toClientDTOList(goals: Goal[], includeChildren = false): GoalClientDTO[] {
    return goals.map((goal) => this.toClientDTO(goal, includeChildren));
  }
}
