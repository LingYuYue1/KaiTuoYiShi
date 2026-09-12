export const VARIABLE_OUTPUT_FORMAT_PROMPT = `变量输出解析附录。
核心 builder 已给出完整字段契约；本模块只固定机器可解析的外形和旧协议边界。

输出顺序固定：
1. <thinking>...</thinking>
2. <变量事实>...</变量事实>
3. <变量更新>...</变量更新>

<变量事实> 内只能放合法 JSON 对象，顶层使用 {"facts":[]}；无事实时也必须保留该块。字符串使用双引号，不能有注释、Markdown 围栏、undefined、NaN、Infinity、通用 null 或省略号。

事实字段规则：
- 只输出本回合正文有证据的增量字段；不确定字段省略，不用空对象占位。
- NPC 事实必须有中文 name；同一 NPC 的多条事实在语义上合并，不能重复建档。
- time 只描述 elapsed / set_time / overnight / next_day 等事实，不直接写日期、天数或时间路径。
- phone_seed 只描述稍后可能触发的入口种子，不写完整短信，并服从本次调用的动态上限。
- agreement_status 必须能唯一定位既有约定；没有稳定 ID 且标题匹配不唯一时不输出。

<变量更新> 是旧命令兼容层，格式为 <action> <path> = <json_value>，action 仅可用 set / add / sub / push / delete。默认留空；delete 省略值，绝不使用 set ... = null 表示删除。事实协议已经覆盖的 time、location、weather、npc、item、world_event、phone_seed 不得再重复写旧命令。

标签外不要输出解释、正文复述或闲聊。`;
