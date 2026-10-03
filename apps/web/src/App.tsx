import { useEffect, useState, createContext, useContext } from 'react';
import { Routes, Route, Navigate, Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Home, Users, CalendarDays, Heart, SquareCheck, Package, ChartNoAxesColumn, FileText, Megaphone, Settings, LogOut, Menu, ChevronRight, ArrowLeftRight, UserRound, Bell, Clock, CreditCard } from 'lucide-react';
import { api, ApiError, queryClient, refresh, type User, type Row, useData } from './lib/api';
import { Button, Form, Modal, Notice, State, Badge } from './components/ui';
import { AdminDashboard, VolunteerDashboard } from './pages/dashboards';
import { StudentPortal } from './pages/StudentPortal';
import { StudentRegister, StudentCheckEmail, StudentVerifyEmail } from './pages/StudentAuth';
import { MembersPage, EventsPage, EventPage, VolunteersPage, TasksPage, ProfilePage, SettingsPage } from './pages/core';
import { ClaimsPage, ShopPage, FinancePage, AnnouncementsPage } from './pages/operations';
const AuthContext=createContext<{user:User|null;setUser:(u:User|null)=>void}>({user:null,setUser:()=>{}});
export const useAuth=()=>useContext(AuthContext);
const allowed=(u:User|null,portal:string)=>!!u?.roles?.includes(portal);
export function WorkspaceLogo({compact=false}:{compact?:boolean}){return <div className={`workspace-brand ${compact?'compact':''}`}><img src="/logo.png" alt="Skyline" className="workspace-logo-img"/></div>;}

export function getWorkspaceDestination(user: User | null): string {
  if (!user || !user.roles || user.roles.length === 0) return '/login';
  if (user.roles.length === 1) {
    const role = user.roles[0];
    if (role === 'admin') return '/admin';
    if (role === 'volunteer') return '/volunteer';
    if (role === 'student') return '/student';
  }
  return '/select-workspace';
}

export function resolveRedirect(user: User, returnTo?: string | null): string {
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('\\') && !returnTo.toLowerCase().includes('login')) {
    const isRootWorkspace = returnTo === '/admin' || returnTo === '/admin/' || returnTo === '/volunteer' || returnTo === '/volunteer/' || returnTo === '/student' || returnTo === '/student/';
    if (!isRootWorkspace || user.roles.length === 1) {
      if (returnTo.startsWith('/admin') && user.roles.includes('admin')) return returnTo;
      if (returnTo.startsWith('/volunteer') && user.roles.includes('volunteer')) return returnTo;
      if (returnTo.startsWith('/student') && user.roles.includes('student')) return returnTo;
      if (returnTo === '/select-workspace' && user.roles.length > 1) return returnTo;
    }
  }
  return getWorkspaceDestination(user);
}

function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();

  useEffect(() => {
    document.title = 'Sign in · Skyline';
  }, []);

  return (
    <div className="login-page">
      <div className="login-card">
        <Link className="brand" to="/login">
          <WorkspaceLogo />
        </Link>
        <h1>Sign in</h1>
        <p className="muted">Welcome back. Sign in to your account.</p>
        <Form
          fields={[
            { name: 'email', label: 'Email address', type: 'email', required: true },
            { name: 'password', label: 'Password', type: 'password', required: true }
          ]}
          label="Sign in"
          onSubmit={async values => {
            const loggedIn = await api<User>('/auth/login', 'POST', {
              email: values.email,
              password: values.password
            });
            setUser(loggedIn);
            const requested = new URLSearchParams(location.search).get('returnTo');
            const next = resolveRedirect(loggedIn, requested);
            nav(next, { replace: true });
          }}
        />
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'center', fontSize: '13px' }}>
          <div>
            <span style={{ color: '#64748b' }}>New student? </span>
            <Link to="/student/register" style={{ color: '#1463D8', fontWeight: 600, textDecoration: 'none' }}>
              Create an account
            </Link>
          </div>
          <p className="login-help" style={{ margin: 0 }}>
            Forgot password?<br />
            Ask an association administrator for a secure setup link.
          </p>
        </div>
      </div>
      <p className="login-footer">A brighter campus starts with a connected community.</p>
    </div>
  );
}

function SelectWorkspace() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    document.title = 'Select Workspace · Skyline';
  }, []);

  const logout = async () => {
    await api('/auth/logout', 'POST', {});
    queryClient.clear();
    nav('/login', { replace: true });
    setUser(null);
  };

  if (!user) return <Navigate to="/login" replace />;
  if (!user.roles || user.roles.length === 0) return <Navigate to="/login" replace />;
  if (user.roles.length === 1) return <Navigate to={getWorkspaceDestination(user)} replace />;

  const options = [
    {
      id: 'admin',
      title: 'Admin Workspace',
      description: 'Manage members, events and finances',
      path: '/admin',
      icon: Users,
      badge: 'Administration'
    },
    {
      id: 'volunteer',
      title: 'Volunteer Workspace',
      description: 'Manage assignments, tasks and claims',
      path: '/volunteer',
      icon: Heart,
      badge: 'Operations'
    },
    {
      id: 'student',
      title: 'Student Workspace',
      description: 'Access events, membership, tickets and merchandise',
      path: '/student',
      icon: Home,
      badge: 'Student Portal'
    }
  ].filter(opt => user.roles.includes(opt.id));

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '520px' }}>
        <Link className="brand" to="/select-workspace">
          <WorkspaceLogo />
        </Link>
        <span className="eyebrow">Welcome, {user.name}</span>
        <h1>Choose your workspace</h1>
        <p className="muted">Your account has access to multiple workspaces. Select one to proceed.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '20px 0' }}>
          {options.map(opt => {
            const Icon = opt.icon;
            return (
              <Link
                key={opt.id}
                to={opt.path}
                className="workspace-choice-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 18px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#eff6ff',
                    color: '#1463D8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Icon size={22} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '15px', color: '#0f172a' }}>{opt.title}</strong>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: '#f1f5f9',
                        color: '#475569'
                      }}>{opt.badge}</span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>{opt.description}</p>
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: '#94a3b8' }} />
              </Link>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
          <Button variant="ghost" onClick={logout} style={{ color: '#64748b' }}>
            <LogOut size={16} /> Sign out
          </Button>
        </div>
      </div>
      <p className="login-footer">A brighter campus starts with a connected community.</p>
    </div>
  );
}

function ResetPassword(){const [done,setDone]=useState(false);const token=new URLSearchParams(useLocation().search).get('token')||'';return <div className="login-page"><div className="login-card"><h1>Set your password</h1><p className="muted">Use the single-use setup link provided by your administrator.</p>{done?<Notice>Password updated. You can now sign in.<div className="action-row"><Link to="/login">Sign in</Link></div></Notice>:<Form fields={[{name:'password',label:'New password',type:'password',required:true,help:'At least 12 characters.'}]} label="Set password" onSubmit={async v=>{await api('/auth/reset-password','POST',{token,password:v.password});setDone(true);}}/>}</div></div>;}

function Protected({portal}:{portal:'admin'|'volunteer'|'student'}){const {user}=useAuth();const location=useLocation();if(!user){const isRoot=location.pathname===`/${portal}`||location.pathname===`/${portal}/`;const returnParam=isRoot?'':`?returnTo=${encodeURIComponent(location.pathname)}`;return <Navigate to={`/login${returnParam}`} replace/>;}if(!allowed(user,portal)){const target=getWorkspaceDestination(user);return <div className="denied"><h1>Access denied</h1><p>Your account does not have permission to open this workspace.</p><Button asChild><Link to={target}>Go to your workspace</Link></Button></div>;}if(portal==='student')return <StudentPortal/>;return <Layout portal={portal}/>;}

function Notifications({open,onOpenChange}:any){const q=useData<Row[]>('/notifications',open);return <Modal open={open} onOpenChange={onOpenChange} title="Notifications" description="Updates intended for your account."><State query={q}><div className="notification-list">{(q.data||[]).map(n=><div className="notification" key={n.id}><div><strong>{n.title||n.message}</strong><p className="muted">{n.body||n.message}</p></div>{!n.read_at&&<Button variant="outline" onClick={async()=>{await api(`/notifications/${n.id}/read`,'POST',{});refresh();}}>Mark read</Button>}{n.read_at&&<Badge status="READ"/>}</div>)}{!q.data?.length&&<p className="muted">You're all caught up.</p>}</div></State></Modal>;}

function Layout({portal}:{portal:'admin'|'volunteer'}){const {user,setUser}=useAuth();const [drawer,setDrawer]=useState(false);const [notifications,setNotifications]=useState(false);const location=useLocation();const nav=useNavigate();useEffect(()=>{setDrawer(false);},[location.pathname]);const links=portal==='admin'?[['','Overview',Home],['members','Members',Users],['events','Events',CalendarDays],['volunteers','Volunteers',Heart],['tasks','Tasks',SquareCheck],['shop','Shop & inventory',Package],['finance','Finance',ChartNoAxesColumn],['reimbursements','Reimbursements',FileText],['announcements','Announcements',Megaphone],['settings','Settings',Settings]]:[['','Overview',Home],['events','My events',CalendarDays],['tasks','My tasks',SquareCheck],['availability','Availability',Clock],['expenses','My expenses',CreditCard],['announcements','Announcements',Megaphone]];
 const logout=async()=>{await api('/auth/logout','POST',{});queryClient.clear();nav('/login',{replace:true});setUser(null);};return <div className="app-shell">{drawer&&<div className="drawer-backdrop" onClick={()=>setDrawer(false)}/>}<aside className={`sidebar ${drawer?'is-open':''}`}><Link className="brand" to={`/${portal}`}><WorkspaceLogo/></Link><p className="workspace-label">{portal==='admin'?'Admin':'Volunteer'} workspace</p><nav aria-label={`${portal} navigation`}>{links.map(([path,label,Icon]:any)=><NavLink key={path} to={`/${portal}${path?'/'+path:''}`} end={!path} className={({isActive})=>`nav-item ${isActive?'active':''}`}><Icon size={20}/><span>{label}</span></NavLink>)}</nav><div className="sidebar-footer">{portal==='admin'&&<div className="campus-note"><Users size={21}/><p>Building a brighter<br/>campus together.</p></div>}<Link to={`/${portal}/profile`} className="account"><div className="avatar">{user?.name?.split(' ').map(s=>s[0]).slice(0,2).join('')}</div><div><strong>{user?.name}</strong><span>{portal==='admin'?'Administrator':'Volunteer'}</span></div><ChevronRight size={16}/></Link>{user?.roles&&user.roles.length>1&&<Button variant="ghost" asChild><Link to="/select-workspace"><ArrowLeftRight size={16}/> Switch workspace</Link></Button>}<Button variant="ghost" onClick={logout}><LogOut size={16}/> Sign out</Button></div></aside><div className="workspace"><div className="mobile-top"><Button variant="ghost" onClick={()=>setDrawer(true)} aria-label="Open navigation"><Menu size={22}/></Button><WorkspaceLogo compact/><Button variant="ghost" onClick={()=>setNotifications(true)} aria-label="Notifications"><Bell size={20}/></Button></div><main><Outlet context={{openNotifications:()=>setNotifications(true)}}/></main><footer className="workspace-footer"><span>Skyline Student Association · Local demo</span><span>INR · Asia/Kolkata</span></footer></div><Notifications open={notifications} onOpenChange={setNotifications}/></div>;}

export default function App(){const [userState,setUserState]=useState<User|null>(null);const session=useQuery({queryKey:['session'],queryFn:()=>api<User>('/auth/me'),retry:false,refetchInterval:15000,refetchOnWindowFocus:true});useEffect(()=>{if(session.isSuccess)setUserState(session.data);else if(session.isError)setUserState(null);},[session.data,session.isSuccess,session.isError]);const user=(session.isPending?userState:(session.data||null))||userState;const setUser=(u:User|null)=>{setUserState(u);queryClient.setQueryData(['session'],u);if(!u)queryClient.removeQueries({predicate:q=>q.queryKey[0]!=='session'});};useEffect(()=>{const expired=()=>{setUser(null);};window.addEventListener('session-expired',expired);return()=>window.removeEventListener('session-expired',expired);},[]);if(session.isPending&&!user)return <div className="state">Opening Skyline…</div>;return <AuthContext.Provider value={{user,setUser}}><Routes><Route path="/login" element={<Login/>}/><Route path="/admin/login" element={<Navigate to="/login?returnTo=%2Fadmin" replace/>}/><Route path="/volunteer/login" element={<Navigate to="/login?returnTo=%2Fvolunteer" replace/>}/><Route path="/student/login" element={<Navigate to="/login?returnTo=%2Fstudent" replace/>}/><Route path="/select-workspace" element={<SelectWorkspace/>}/><Route path="/student/register" element={<StudentRegister/>}/><Route path="/student/check-email" element={<StudentCheckEmail/>}/><Route path="/student/verify-email" element={<StudentVerifyEmail/>}/><Route path="/reset-password" element={<ResetPassword/>}/><Route path="/admin" element={<Protected portal="admin"/>}><Route index element={<AdminDashboard/>}/><Route path="dashboard" element={<Navigate to="/admin" replace/>}/><Route path="members" element={<MembersPage/>}/><Route path="events" element={<EventsPage/>}/><Route path="events/:id" element={<EventPage/>}/><Route path="volunteers" element={<VolunteersPage/>}/><Route path="tasks" element={<TasksPage/>}/><Route path="shop" element={<ShopPage/>}/><Route path="finance" element={<FinancePage/>}/><Route path="reimbursements" element={<ClaimsPage/>}/><Route path="announcements" element={<AnnouncementsPage/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="profile" element={<ProfilePage/>}/></Route><Route path="/volunteer" element={<Protected portal="volunteer"/>}><Route index element={<VolunteerDashboard/>}/><Route path="dashboard" element={<Navigate to="/volunteer" replace/>}/><Route path="events" element={<EventsPage volunteer/>}/><Route path="events/:id" element={<EventPage volunteer/>}/><Route path="tasks" element={<TasksPage volunteer/>}/><Route path="availability" element={<EventsPage volunteer availability/>}/><Route path="expenses" element={<ClaimsPage volunteer/>}/><Route path="announcements" element={<AnnouncementsPage volunteer/>}/><Route path="profile" element={<ProfilePage/>}/></Route><Route path="/student" element={<Protected portal="student"/>}/><Route path="/student/dashboard" element={<Navigate to="/student" replace/>}/><Route path="/student/*" element={<Protected portal="student"/>}/><Route path="/" element={<Navigate to={user?getWorkspaceDestination(user):'/login'} replace/>}/><Route path="*" element={<div className="denied"><h1>Page not found</h1><Button asChild><Link to="/">Return to Skyline</Link></Button></div>}/></Routes></AuthContext.Provider>;}
