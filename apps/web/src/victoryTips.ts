import type { PlayerRole, TeamName } from "@codenames/shared";

const teamLabels: Record<TeamName, string> = {
  red: "红队",
  blue: "蓝队",
};

type VictoryRoleType = "spymaster" | "operative" | "spectator";

export interface VictoryTipsContent {
  title: string;
  tips: string[];
}

function teamForRole(role: PlayerRole): TeamName | null {
  if (role.startsWith("red_")) {
    return "red";
  }
  if (role.startsWith("blue_")) {
    return "blue";
  }
  return null;
}

function roleTypeForRole(role: PlayerRole): VictoryRoleType {
  if (role.endsWith("_spymaster")) {
    return "spymaster";
  }
  if (role.endsWith("_operatives")) {
    return "operative";
  }
  return "spectator";
}

const roleTips: Record<TeamName, Record<Exclude<VictoryRoleType, "spectator">, string[]>> = {
  red: {
    spymaster: [
      "红队先手且多一张关键牌，前两轮要主动建立节奏，但线索数量不要为了抢速硬撑。",
      "先清理最明确的组合，给队员留下可验证路径，别把刺客和蓝牌放进同一条线索。",
      "领先时收窄范围，稳定推进比冒险扩大优势更重要。",
    ],
    operative: [
      "红队先手且多一张，优先执行队长最明确的组合，先把开局优势落成分数。",
      "猜中后仍要检查刺客和蓝牌位置，不要因为领先就追加不确定的猜测。",
      "如果线索范围变窄，及时结束回合保住节奏，把压力留给蓝队。",
    ],
  },
  blue: {
    spymaster: [
      "蓝队后手且少一张关键牌，先观察红队揭开的信息，再用更稳的线索追分。",
      "红队冒进后，优先利用已暴露的安全区和错误排除，争取一轮追回多张。",
      "落后时不要被迫跟速度，避开刺客和红牌，等待红队失误反打。",
    ],
    operative: [
      "蓝队后手且少一张，先利用红队翻开的信息排除危险，再稳准追分。",
      "红队领先时不要盲目多猜，优先保护不点刺客和红牌的底线。",
      "发现红队线索暴露出的误区后，和队友统一判断，用一次高质量回合反打。",
    ],
  },
};

const spectatorTips = ["只观察公共信息，不暗示答案、颜色或危险牌。", "结算前不要用表情、语气或动作影响任一队判断。", "需要讲解规则时，只解释通用规则，不评价当前牌阵。"];

export function victoryTipsForRole(role: PlayerRole): VictoryTipsContent {
  const team = teamForRole(role);
  const roleType = roleTypeForRole(role);

  if (!team || roleType === "spectator") {
    return {
      title: "旁观者提示",
      tips: spectatorTips,
    };
  }

  const teamName = teamLabels[team];
  return {
    title: roleType === "spymaster" ? `${teamName}队长获胜技巧` : `${teamName}队员获胜技巧`,
    tips: roleTips[team][roleType],
  };
}
