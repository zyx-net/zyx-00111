import { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Upload, AlertTriangle, Settings, FileDown } from 'lucide-react';
import { clsx } from 'clsx';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/import', icon: Upload, label: '数据导入' },
  { to: '/review', icon: AlertTriangle, label: '异常复核' },
  { to: '/config', icon: Settings, label: '规则配置' },
  { to: '/export', icon: FileDown, label: '导出中心' },
];

export function Layout({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-800 text-white shadow-lg">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold tracking-tight">能耗抄表复核</h1>
          <p className="text-sm text-slate-400 mt-1">异常检测与修正系统</p>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                )
              }
            >
              <Icon size={20} />
              <span className="font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <div className="text-xs text-slate-500">
            <p>v1.0.0</p>
            <p className="mt-1">能源管理系统</p>
          </div>
        </div>
      </aside>

      <main className="ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
}
