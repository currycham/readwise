// 按“要解决的问题”组织的两级分类。每本书可属于 1–3 个子问题。
// 模型生成时只能从这里选；需要新增子问题时由管理员在这里添加。
export const CATEGORIES = [
  { id: 'habit', name: '如何改变习惯与行为', subs: ['总是拖延', '坚持不下去', '想戒掉坏习惯', '想建立新习惯'] },
  { id: 'time', name: '如何管理时间与精力', subs: ['事情太多忙不过来', '精力不足容易疲惫', '专注力差', '工作与生活失衡'] },
  { id: 'think', name: '如何思考与决策', subs: ['做决定时犹豫不决', '想提升思维质量', '容易被偏见误导', '面对不确定性'] },
  { id: 'learn', name: '如何高效学习', subs: ['学了记不住', '读书读不进去', '想快速掌握新技能', '如何持续成长'] },
  { id: 'relate', name: '如何沟通与经营关系', subs: ['不会表达自己', '处理冲突', '建立信任与影响力', '亲密关系与家庭'] },
  { id: 'emotion', name: '如何面对情绪与压力', subs: ['焦虑与压力大', '走出低谷', '提升自我价值感', '与自己和解'] },
  { id: 'meaning', name: '如何找到方向与意义', subs: ['不知道自己想要什么', '职业选择与转型', '创造自己想要的生活', '人生意义与幸福'] },
  { id: 'money', name: '如何理财与积累财富', subs: ['不会管钱', '想开始投资', '财富观念', '财务自由'] },
  { id: 'lead', name: '如何领导与协作', subs: ['第一次带团队', '提升团队效能', '组织与管理', '影响他人'] },
  { id: 'world', name: '如何理解世界与社会', subs: ['理解经济与商业', '理解人性与心理', '理解历史与文明', '理解科技与未来'] },
];

export function categoryListText() {
  return CATEGORIES.map(c => `- ${c.name}：${c.subs.join('、')}`).join('\n');
}

export function isValidCategory(top, sub) {
  const c = CATEGORIES.find(x => x.name === top);
  return !!c && c.subs.includes(sub);
}
