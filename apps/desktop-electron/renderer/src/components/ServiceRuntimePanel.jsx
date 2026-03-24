export function ServiceRuntimePanel({ runtimeInfo, serviceStatus }) {
  return (
    <section className="sidebar-runtime">
      <span className="section-label">运行时</span>
      <dl>
        <div>
          <dt>服务地址</dt>
          <dd>{serviceStatus.url}</dd>
        </div>
        <div>
          <dt>数据目录</dt>
          <dd title={runtimeInfo.runtimeDir || "未就绪"}>{runtimeInfo.runtimeDir || "等待中"}</dd>
        </div>
        <div>
          <dt>模式</dt>
          <dd>{runtimeInfo.isPackaged ? "发布版" : "开发版"}</dd>
        </div>
      </dl>
    </section>
  );
}
