import { 
  Bell,
  History,
  Globe,
} from 'lucide-react';

const DomainMonitor = () => {
  // 通知方式配置（预留功能）
  // const [notificationMethods] = useState([
  //   { id: 498, type: 'Telegram', value: '8464921285:AAEu4W...D2vab8z-wmESRw.OJYPKwew7cq1Y', secondValue: '-5032536833', createdAt: '3 days ago' }
  // ]);

  // 以下状态变量暂时注释，因为当前版本未使用
  // const [monitoredTargets, setMonitoredTargets] = useState([
  //   { 
  //     id: 3461, 
  //     active: true, 
  //     type: 'Domain', 
  //     category: 'All', 
  //     value: 'Domain.com', 
  //     method: 'Telegram',
  //     autoUnlock: 'Yes',
  //     maxPts: 500,
  //     lastSearch: '5 hours ago',
  //     createdAt: '3 days ago'
  //   }
  // ]);

  // const [monitoringRuns] = useState([
  //   { 
  //     runId: 25267, 
  //     sentAt: '2025/12/23 15:23:00', 
  //     notifId: 3461, 
  //     type: 'domain', 
  //     asset: 'Domain.com', 
  //     new: 38, 
  //     status: 'OK' 
  //   }
  // ]);

  // 切换监控目标状态（预留功能）
  // const toggleTargetStatus = (id: number) => {
  //   setMonitoredTargets(prev => prev.map(target => 
  //     target.id === id ? { ...target, active: !target.active } : target
  //   ));
  // };

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-black text-white tracking-tight">资产监测 (Monitoring)</h1>
        <p className="text-gray-400 text-sm max-w-3xl leading-relaxed">
          设置您希望接收告警的时间和方式，并选择我们将为您监控泄露的目标。一旦检测到新的泄露，我们将立即通知您。
        </p>
      </div>



      {/* Notification Methods Card */}
      <div className="glass-card border-white/5 bg-[#16161a] overflow-hidden rounded-2xl shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#1a1a20]/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Bell className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="font-bold text-white uppercase tracking-wider text-sm">通知方式 (Notification Methods)</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] bg-black/20">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">类型</th>
                <th className="px-6 py-4">值 (VALUE)</th>
                <th className="px-6 py-4">第二参数</th>
                <th className="px-6 py-4">创建于</th>
                <th className="px-6 py-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr className="text-sm hover:bg-white/[0.02] transition-colors group">
                <td className="px-6 py-4 text-gray-500 font-mono">---</td>
                <td className="px-6 py-4">
                  <span className="bg-gray-500/20 text-gray-300 px-3 py-1 rounded-full text-xs font-bold border border-gray-500/30">
                    ---
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-400 font-mono text-xs">---</td>
                <td className="px-6 py-4 text-gray-500 font-mono">---</td>
                <td className="px-6 py-4 text-gray-500 text-xs">---</td>
                <td className="px-6 py-4"></td>
              </tr>
            </tbody>
          </table>
          <div className="p-4 bg-black/20 flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            <span>显示 0-0 项，共 0 项</span>
            <div className="flex gap-4">
              <button className="hover:text-white disabled:opacity-30" disabled>&lt;</button>
              <button className="hover:text-white disabled:opacity-30" disabled>&gt;</button>
            </div>
          </div>
        </div>
      </div>

      {/* Monitored Targets Card */}
      <div className="glass-card border-white/5 bg-[#16161a] overflow-hidden rounded-2xl shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#1a1a20]/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Globe className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="font-bold text-white uppercase tracking-wider text-sm">监控目标 (Monitored Targets 0/100)</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] bg-black/20">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4">类型</th>
                <th className="px-6 py-4">类别</th>
                <th className="px-6 py-4">资产值</th>
                <th className="px-6 py-4">通知方式</th>
                <th className="px-6 py-4">自动解锁</th>
                <th className="px-6 py-4">最大点数</th>
                <th className="px-6 py-4">上次搜索</th>
                <th className="px-6 py-4">创建于</th>
                <th className="px-6 py-4 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr className="text-sm hover:bg-white/[0.02] transition-colors group">
                <td className="px-6 py-4 text-gray-500 font-mono">---</td>
                <td className="px-6 py-4">
                  <div className="w-10 h-5 rounded-full bg-gray-700 relative">
                    <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white/50" />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="bg-gray-500/20 text-gray-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-gray-500/30">
                    ---
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border border-white/5">
                    ---
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-300 font-medium">---</td>
                <td className="px-6 py-4">---</td>
                <td className="px-6 py-4 text-gray-400">---</td>
                <td className="px-6 py-4 text-gray-400 font-mono">---</td>
                <td className="px-6 py-4 text-gray-500 text-xs">---</td>
                <td className="px-6 py-4 text-gray-500 text-xs">---</td>
                <td className="px-6 py-4"></td>
              </tr>
            </tbody>
          </table>
          <div className="p-4 bg-black/20 flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            <span>显示 0-0 项，共 0 项</span>
            <div className="flex gap-4">
              <button className="hover:text-white disabled:opacity-30" disabled>&lt;</button>
              <button className="hover:text-white disabled:opacity-30" disabled>&gt;</button>
            </div>
          </div>
        </div>
      </div>

      {/* Monitoring Runs Card */}
      <div className="glass-card border-white/5 bg-[#16161a] overflow-hidden rounded-2xl shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#1a1a20]/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <History className="w-5 h-5 text-amber-400" />
            </div>
            <h3 className="font-bold text-white uppercase tracking-wider text-sm">运行记录 (Monitoring Runs)</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] bg-black/20">
                <th className="px-6 py-4">RUN ID</th>
                <th className="px-6 py-4">发送时间</th>
                <th className="px-6 py-4">通知 ID</th>
                <th className="px-6 py-4">类型</th>
                <th className="px-6 py-4">资产</th>
                <th className="px-6 py-4">新增</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr className="text-sm hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4 text-gray-500 font-mono">---</td>
                <td className="px-6 py-4 text-gray-400 font-mono text-xs">---</td>
                <td className="px-6 py-4 text-gray-500 font-mono">---</td>
                <td className="px-6 py-4 text-gray-500 uppercase text-[10px] font-bold">---</td>
                <td className="px-6 py-4 text-gray-300 font-medium">---</td>
                <td className="px-6 py-4 text-gray-400 font-mono">---</td>
                <td className="px-6 py-4">
                  <span className="bg-gray-500/20 text-gray-400 px-4 py-0.5 rounded-full text-[10px] font-black border border-gray-500/30">
                    ---
                  </span>
                </td>
                <td className="px-6 py-4 text-right"></td>
              </tr>
            </tbody>
          </table>
          <div className="p-4 bg-black/20 flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            <span>显示 0-0 项，共 0 项</span>
            <div className="flex gap-4">
              <button className="hover:text-white disabled:opacity-30" disabled>&lt;</button>
              <button className="hover:text-white disabled:opacity-30" disabled>&gt;</button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="flex justify-center pt-8 pb-12">
        <p className="text-gray-600 text-xs font-bold tracking-[0.3em] uppercase">理是高级威胁泄露监测</p>
      </div>
    </div>
  );
};

export default DomainMonitor;
