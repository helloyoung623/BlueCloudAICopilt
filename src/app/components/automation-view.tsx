// 自动化任务对外入口：组件/类型/常量/纯函数按职责拆到 ./automation/，
// 这里只保留原导出面，调用方无需改 import 路径。
export { AutomationView } from "./automation/automation-list";
export { DeleteTaskDialog } from "./automation/delete-task-dialog";
export { AutomationDetailPanel } from "./automation/automation-detail-panel";
export { useDismissOnOutside } from "./automation/hooks";
export { AUTOMATION_ICONS, INITIAL_TASKS, TASK_OPERATIONS } from "./automation/constants";
export type { AutomationCardStatus, ScheduleState, AutomationIcon, AutomationTask, RunRecord, RunRecordStatus, CalendarDate } from "./automation/types";
// taskIconSrc 拆分前就在这层对外导出，当前虽无调用方，仍保留以维持原有导出面。
export { summarizeSchedule, describeSchedule, cardTimeLabel, cardSubtitle, resolveAutomationIcon, automationIconSrc, taskIconSrc, buildRunRecords, makeRunRecord, buildDefaultSchedule } from "./automation/utils";
