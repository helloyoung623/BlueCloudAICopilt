// Figma 9650:46400 / 1132:19398「Outlook 选择面板」邮件列表。
// 输入框附件面板与「选择文件」弹窗的 Outlook 页签共用这套数据与行样式，
// 行形态由面板宽度决定（< 640px 无头像、正文换行），不在数据里写死。
// 输入面板（798px）与「选择文件」弹窗列表区（672px）共用此阈值，确保两处响应规则一致。
export const OUTLOOK_NARROW_BREAKPOINT = 640;
export type OutlookEmail = {
  id: string;
  sender: string;
  avatar: string;
  avatarBg: string;
  avatarColor: string;
  title: string;
  body: string;
  time: string;
};

export const OUTLOOK_EMAILS: OutlookEmail[] = [
  { id: "zhang-wei-q4", sender: "张伟", avatar: "张", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "Q4 销售数据汇总及分析报告", body: "各位好，Q4 销售数据已经整理完毕，整体同比增长 12.5%，详细数据请见附件，有问题随时沟通。", time: "2026年2月5日  22:23" },
  { id: "li-na-review", sender: "李娜", avatar: "李", avatarBg: "#f0fdf4", avatarColor: "#22c45e", title: "关于下周产品评审会的安排", body: "评审会定于下周三下午 2 点在 3 号会议室举行，请各项目组提前准备好演示材料。", time: "2026年2月5日  18:47" },
  { id: "wang-qiang-contract", sender: "王强", avatar: "王", avatarBg: "#fff0f0", avatarColor: "#f1222e", title: "合同审批流程已提交，麻烦跟进", body: "世纪互联合作协议已进入法务审批环节，预计本周五完成，麻烦王总审阅。", time: "2026年2月5日  15:12" },
  { id: "chen-xiaomei-budget", sender: "陈晓梅", avatar: "陈", avatarBg: "#fffcf2", avatarColor: "#d9b40c", title: "2026 年预算调整方案征求意见", body: "按财务部要求，各部门需在本周五前反馈预算调整意见，逾期视为无异议。", time: "2026年2月4日  17:30" },
  { id: "liu-yang-weekly", sender: "刘洋", avatar: "刘", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "智能助手项目周报（第 6 周）", body: "本周完成归档页面开发与可撤销 toast 联调，下周进行整体回归测试。", time: "2026年2月4日  11:20" },
  { id: "zhao-lei-visit", sender: "赵磊", avatar: "赵", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "客户拜访安排确认", body: "已与世纪互联确认拜访时间为下周四上午，会议邀请已发出，请查收日历。", time: "2026年2月3日  16:05" },
  { id: "zhou-jie-training", sender: "周洁", avatar: "周", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "新员工入职培训材料更新", body: "附件为最新版培训材料，请各部门负责人转发给近期入职的同事。", time: "2026年2月2日  09:41" },
  { id: "wu-min-server", sender: "吴敏", avatar: "吴", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "服务器迁移窗口通知", body: "本周六 22:00-24:00 进行服务器迁移，期间服务可能短暂中断，请提前做好准备。", time: "2026年1月30日  19:08" },
  { id: "zheng-hao-design", sender: "郑浩", avatar: "郑", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "设计评审反馈汇总", body: "针对 V2.0 设计稿的评审意见已汇总到文档，详见附件，预计下周三前完成修改。", time: "2026年1月29日  14:26" },
  { id: "long-title-supply-chain", sender: "孙晓琳", avatar: "孙", avatarBg: "#eef2ff", avatarColor: "#4f46e5", title: "关于 2026 年第四季度全球供应链优化方案及区域仓储履约效率提升专项评审会议的通知与安排", body: "各位同事好，为进一步提升四季度全球供应链的响应速度与区域仓储的履约效率，公司决定召开专项评审会议，请各区域负责人提前准备相关数据与材料，会议纪要及议程详见附件，如有时间冲突请尽早反馈。", time: "2026年2月6日  09:15" },
  { id: "long-title-design-walkthrough", sender: "何俊杰", avatar: "何", avatarBg: "#fdf2f8", avatarColor: "#db2777", title: "Re: 蓝云 AI 助手 V2.0 版本设计走查、交互细节确认与下周灰度发布计划安排（含附件，请查收）", body: "大家好，附件是蓝云 AI 助手 V2.0 版本的最新设计走查记录，包含交互细节的确认结论与下周灰度发布的详细计划，请产品、设计、研发三方负责人于本周五前完成审阅并回复意见，谢谢配合。", time: "2026年2月6日  10:32" },
  { id: "long-title-schedule-change", sender: "林思远", avatar: "林", avatarBg: "#fff7ed", avatarColor: "#ea580c", title: "【重要】关于调整本周五产品迭代评审时间、参会人员名单及会议材料提交截止日期的补充说明", body: "因部分同事时间冲突，原定于本周五下午的产品迭代评审会调整至周六上午十点，参会人员名单与材料提交截止日期同步顺延，请相关人员留意最新日历邀请并按更新后的时间准备。", time: "2026年2月6日  11:48" },
];

export const emailFileName = (email: OutlookEmail) => `Outlook-${email.sender}-${email.id}.eml`;

export const emailBlob = (email: OutlookEmail) => new Blob(
  [`From: ${email.sender} <demo@example.invalid>\r\nTo: team@example.invalid\r\nSubject: ${email.title}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${email.body}\r\n`],
  { type: "message/rfc822" },
);

// 「2026年2月5日  22:23」→ Date，供时间筛选使用
export function emailDate(time: string) {
  const matched = /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/.exec(time);
  if (!matched) return new Date();
  return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]), Number(matched[4]), Number(matched[5]));
}

export const emailSearchText = (email: OutlookEmail) => `${email.sender} ${email.title} ${email.body}`;

// Figma 9650:46400「CheckBox Icon」：16x16 容器，内为 12x12 描边方框
function EmailCheckbox({ checked }: { checked: boolean }) {
  return (
    <img
      src={checked ? "/assets/checkbox-checked.svg" : "/assets/checkbox-unchecked.svg"}
      alt=""
      width={16}
      height={16}
      className="block size-[16px] shrink-0"
      aria-hidden
    />
  );
}

/* 邮件区域布局规则（与设计稿一致）：
   1. 标题 max-width 480px，超出省略号；
   2. 正文占标题外的剩余宽度（flex-1），超出省略号；
   3. 面板宽 < 640px：隐藏头像、正文换行（1132:19398 三行版）；>= 640px 带头像、标题正文同行（9650:46400）。 */
export function OutlookEmailList({ emails, isSelected, onToggle, narrow, className = "" }: {
  emails: OutlookEmail[];
  isSelected: (email: OutlookEmail) => boolean;
  onToggle: (email: OutlookEmail) => void;
  narrow: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-[16px] ${className}`}>
      {emails.map(email => {
        const selected = isSelected(email);
        return narrow ? (
          <button
            key={email.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(email)}
            className="flex w-full shrink-0 cursor-pointer flex-col justify-center gap-[4px] rounded-[8px] bg-transparent pr-[16px] text-left font-normal"
          >
            <span className="flex h-[22px] items-center gap-[8px]">
              <EmailCheckbox checked={selected} />
              <span className="shrink-0 truncate text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{email.sender}</span>
              <span className="min-w-0 flex-1 truncate text-right text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.6)]">{email.time}</span>
            </span>
            <span className="flex min-w-0 pl-[24px]">
              <span className="max-w-[480px] min-w-0 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{email.title}</span>
            </span>
            <span className="flex min-w-0 pl-[24px]">
              <span className="min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">{email.body}</span>
            </span>
          </button>
        ) : (
          <button
            key={email.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(email)}
            className="flex h-[64px] w-full shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] bg-transparent py-[8px] pr-[16px] text-left font-normal"
          >
            <EmailCheckbox checked={selected} />
            <span className="flex size-[48px] shrink-0 items-center justify-center rounded-full text-[20px] font-normal leading-[28px]" style={{ background: email.avatarBg, color: email.avatarColor }}>{email.avatar}</span>
            <span className="flex h-[48px] min-w-0 flex-1 flex-col gap-[4px]">
              <span className="flex h-[22px] items-baseline">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{email.sender}</span>
                <span className="shrink-0 pl-[12px] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">{email.time}</span>
              </span>
              <span className="flex h-[22px] min-w-0 gap-[8px]">
                <span className="max-w-[480px] min-w-0 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{email.title}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">{email.body}</span>
              </span>
            </span>
          </button>
        );
      })}
      {!emails.length && <p className="py-[40px] text-center text-[14px] text-[rgba(0,0,0,0.38)]">没有匹配的邮件</p>}
    </div>
  );
}
