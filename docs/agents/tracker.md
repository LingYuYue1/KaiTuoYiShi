# Issue Tracker

本仓库使用 GitHub Issues；在仓库内使用 `gh` CLI。先确认 `git remote -v` 与登录状态。常用操作：`gh issue create`、`gh issue view`、`gh issue list`、`gh issue comment`、`gh issue edit`、`gh issue close`。

标准标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。GitHub 不可用时停止外部写入并报告失败，不假设成功。PR 默认不是 triage 请求面；Wayfinder 失败时回退到 issue body 的 `Part of #n` 和 `Blocked by: #n`。
