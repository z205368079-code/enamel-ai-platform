# Third-Party Notices

本项目是独立的面试 PoC，不隶属于 Chatwoot Inc. 或 1Panel-dev，也不暗示获得其背书。

## 当前仓库包含的依赖

Node.js 依赖及其精确版本由 `package-lock.json` 记录。安装或分发前应使用依赖审计工具重新检查许可证与安全公告。

## 计划集成但未复制到本仓库的服务

### Chatwoot

- 上游项目：https://github.com/chatwoot/chatwoot
- 用途：计划在 Phase 1 作为独立客服系统，通过 Webhook/API 与 Gateway 集成。
- 许可证：上游公开仓库说明，`enterprise/` 目录之外的代码通常采用 MIT Expat License；企业目录及第三方组件适用各自许可证。
- Phase 0 状态：未包含 Chatwoot 源码、镜像或修改内容。

### MaxKB

- 上游项目：https://github.com/1Panel-dev/MaxKB
- 用途：计划在 Phase 2 作为独立知识库/RAG 服务，通过 API 与 Gateway 集成。
- 许可证：GNU General Public License v3.0（GPL-3.0）。
- Phase 0 状态：未包含 MaxKB 源码、镜像或修改内容。

## 合规约定

- 第三方作者不会被写入本项目提交的 `Co-authored-by`，除非其本人实际共同完成该提交。
- 引入具体镜像或源码前，必须固定版本并再次核对对应版本的许可证和分发义务。
- 如未来分发第三方程序或修改版本，应随交付物保留适用的版权、许可证文本与源码提供义务；本文件不能替代法律意见。
