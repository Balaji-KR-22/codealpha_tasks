require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const PORT = Number(process.env.PORT || 3002);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'replace_this_with_a_long_random_secret') {
  console.warn('WARNING: Set a unique JWT_SECRET in your .env file before using outside local development.');
}
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'taskflow_pro', waitForConnections: true,
  connectionLimit: 10, queueLimit: 0, dateStrings: true
});
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const safeUser = u => ({ id: u.id, name: u.name, email: u.email, avatar_color: u.avatar_color });
const signToken = user => jwt.sign({ id: user.id, email: user.email }, JWT_SECRET || 'local-development-secret-change-me', { expiresIn: '7d' });
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
    const payload = jwt.verify(token, JWT_SECRET || 'local-development-secret-change-me');
    const [rows] = await pool.query('SELECT id,name,email,avatar_color FROM users WHERE id=?', [payload.id]);
    if (!rows.length) return res.status(401).json({ error: 'Account not found. Please sign in again.' });
    req.user = rows[0]; next();
  } catch (e) { return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' }); }
}
async function isMember(projectId, userId) {
  const [rows] = await pool.query('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?', [projectId, userId]);
  return rows.length > 0;
}
async function logActivity(projectId, userId, taskId, action, details) {
  await pool.query('INSERT INTO activity_logs (project_id,user_id,task_id,action,details) VALUES (?,?,?,?,?)', [projectId,userId,taskId || null,action,details || null]);
}
async function notify(userId, projectId, taskId, message, type='activity') {
  if (!userId) return;
  const [r] = await pool.query('INSERT INTO notifications (user_id,project_id,task_id,message,type) VALUES (?,?,?,?,?)', [userId,projectId || null,taskId || null,message,type]);
  const [rows] = await pool.query('SELECT * FROM notifications WHERE id=?', [r.insertId]);
  io.to(`user:${userId}`).emit('notification:new', rows[0]);
}

app.get('/api/health', async (_req,res) => {
  try { await pool.query('SELECT 1'); res.json({ ok:true, database:'connected', service:'TaskFlow Pro API' }); }
  catch (e) { res.status(503).json({ ok:false, database:'disconnected', error:'Cannot connect to MySQL. Check your .env settings and import db/schema.sql.' }); }
});
app.post('/api/auth/register', async (req,res) => {
  try {
    const name = String(req.body.name || '').trim(); const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || '');
    if (name.length < 2 || name.length > 100) return res.status(400).json({error:'Name must be between 2 and 100 characters.'});
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 190) return res.status(400).json({error:'Enter a valid email address.'});
    if (password.length < 8) return res.status(400).json({error:'Password must be at least 8 characters.'});
    const hash = await bcrypt.hash(password, 12); const color = ['#7868e6','#ef8d6b','#36a995','#4c8bd9'][Math.floor(Math.random()*4)];
    const [result] = await pool.query('INSERT INTO users (name,email,password_hash,avatar_color) VALUES (?,?,?,?)', [name,email,hash,color]);
    const user = {id:result.insertId,name,email,avatar_color:color}; res.status(201).json({token:signToken(user),user:safeUser(user)});
  } catch(e) { if(e.code==='ER_DUP_ENTRY') return res.status(409).json({error:'An account with this email already exists.'}); console.error(e); res.status(500).json({error:'Could not create your account.'}); }
});
app.post('/api/auth/login', async (req,res) => {
  try {
    const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||'');
    const [rows]=await pool.query('SELECT * FROM users WHERE email=?',[email]);
    if(!rows.length || !(await bcrypt.compare(password,rows[0].password_hash))) return res.status(401).json({error:'Email or password is incorrect.'});
    res.json({token:signToken(rows[0]),user:safeUser(rows[0])});
  } catch(e){console.error(e);res.status(500).json({error:'Could not sign in. Check the database connection.'});}
});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:safeUser(req.user)}));
app.get('/api/users',auth,async(req,res)=>{try{const [rows]=await pool.query('SELECT id,name,email,avatar_color FROM users ORDER BY name');res.json(rows);}catch(e){res.status(500).json({error:'Could not load team members.'});}});

app.get('/api/projects',auth,async(req,res)=>{
 try { const [rows]=await pool.query(`SELECT p.*, pm.role, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count,
 (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='done') completed_count,
 (SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id) member_count
 FROM projects p JOIN project_members pm ON pm.project_id=p.id WHERE pm.user_id=? ORDER BY p.created_at DESC`,[req.user.id]); res.json(rows); }
 catch(e){console.error(e);res.status(500).json({error:'Could not load projects.'});}
});
app.post('/api/projects',auth,async(req,res)=>{
 try { const name=String(req.body.name||'').trim(), description=String(req.body.description||'').trim(), color=String(req.body.color||'#7868e6');
 if(name.length<2||name.length>140)return res.status(400).json({error:'Project name must be between 2 and 140 characters.'});
 const conn=await pool.getConnection(); let id;
 try {await conn.beginTransaction();const [r]=await conn.query('INSERT INTO projects (name,description,color,owner_id) VALUES (?,?,?,?)',[name,description,color,req.user.id]);id=r.insertId;await conn.query('INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,?)',[id,req.user.id,'owner']);await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
 await logActivity(id,req.user.id,null,'created project',name);const [rows]=await pool.query('SELECT p.*,\'owner\' role,0 task_count,0 completed_count,1 member_count FROM projects p WHERE p.id=?',[id]);res.status(201).json(rows[0]);
 }catch(e){console.error(e);res.status(500).json({error:'Could not create project.'});}
});
app.get('/api/projects/:id',auth,async(req,res)=>{
 try{const id=Number(req.params.id);if(!await isMember(id,req.user.id))return res.status(403).json({error:'You are not a member of this project.'});const [p]=await pool.query('SELECT p.*,u.name owner_name FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.id=?',[id]);if(!p.length)return res.status(404).json({error:'Project not found.'});const [members]=await pool.query('SELECT u.id,u.name,u.email,u.avatar_color,pm.role FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? ORDER BY pm.role DESC,u.name',[id]);res.json({...p[0],members});}catch(e){console.error(e);res.status(500).json({error:'Could not load project.'});}
});
app.post('/api/projects/:id/members',auth,async(req,res)=>{
 try{const id=Number(req.params.id), email=String(req.body.email||'').trim().toLowerCase();if(!await isMember(id,req.user.id))return res.status(403).json({error:'Only project members can invite teammates.'});const [users]=await pool.query('SELECT id,name FROM users WHERE email=?',[email]);if(!users.length)return res.status(404).json({error:'No account found for that email. Ask them to register first.'});await pool.query('INSERT IGNORE INTO project_members(project_id,user_id,role) VALUES (?,?,\'member\')',[id,users[0].id]);await notify(users[0].id,id,null,`${req.user.name} added you to a project`,'project');io.to(`project:${id}`).emit('project:changed',{projectId:id});res.status(201).json({message:`${users[0].name} is now a project member.`});}catch(e){console.error(e);res.status(500).json({error:'Could not add teammate.'});}
});
app.get('/api/projects/:id/tasks',auth,async(req,res)=>{
 try{const id=Number(req.params.id);if(!await isMember(id,req.user.id))return res.status(403).json({error:'You are not a member of this project.'});const [rows]=await pool.query(`SELECT t.*,DATE_FORMAT(t.due_date,'%Y-%m-%d') due_date, a.name assignee_name,a.avatar_color assignee_color,c.name creator_name,(SELECT COUNT(*) FROM comments cm WHERE cm.task_id=t.id) comment_count FROM tasks t LEFT JOIN users a ON a.id=t.assignee_id JOIN users c ON c.id=t.creator_id WHERE t.project_id=? ORDER BY t.position,t.created_at DESC`,[id]);res.json(rows);}catch(e){console.error(e);res.status(500).json({error:'Could not load tasks.'});}
});
app.post('/api/projects/:id/tasks',auth,async(req,res)=>{
 try{const pid=Number(req.params.id);if(!await isMember(pid,req.user.id))return res.status(403).json({error:'You are not a member of this project.'});const title=String(req.body.title||'').trim(),description=String(req.body.description||'').trim(),status=['todo','progress','review','done'].includes(req.body.status)?req.body.status:'todo',priority=['low','medium','high','urgent'].includes(req.body.priority)?req.body.priority:'medium',assignee=req.body.assignee_id?Number(req.body.assignee_id):null,due=req.body.due_date||null;
 if(title.length<2||title.length>180)return res.status(400).json({error:'Task title must be between 2 and 180 characters.'});if(assignee&&!await isMember(pid,assignee))return res.status(400).json({error:'Assignee must be a member of this project.'});
 const [pos]=await pool.query('SELECT COALESCE(MAX(position),0)+1 next_pos FROM tasks WHERE project_id=? AND status=?',[pid,status]);const [r]=await pool.query('INSERT INTO tasks(project_id,title,description,status,priority,assignee_id,creator_id,due_date,position) VALUES (?,?,?,?,?,?,?,?,?)',[pid,title,description,status,priority,assignee,req.user.id,due,pos[0].next_pos]);await logActivity(pid,req.user.id,r.insertId,'created task',title);if(assignee&&assignee!==req.user.id)await notify(assignee,pid,r.insertId,`${req.user.name} assigned you: ${title}`,'assignment');const [rows]=await pool.query(`SELECT t.*,DATE_FORMAT(t.due_date,'%Y-%m-%d') due_date,a.name assignee_name,a.avatar_color assignee_color,c.name creator_name,0 comment_count FROM tasks t LEFT JOIN users a ON a.id=t.assignee_id JOIN users c ON c.id=t.creator_id WHERE t.id=?`,[r.insertId]);io.to(`project:${pid}`).emit('task:created',{projectId:pid,task:rows[0]});res.status(201).json(rows[0]);
 }catch(e){console.error(e);res.status(500).json({error:'Could not create task.'});}
});
app.patch('/api/tasks/:id',auth,async(req,res)=>{
 try{const id=Number(req.params.id);const [oldRows]=await pool.query('SELECT * FROM tasks WHERE id=?',[id]);if(!oldRows.length)return res.status(404).json({error:'Task not found.'});const old=oldRows[0];if(!await isMember(old.project_id,req.user.id))return res.status(403).json({error:'You are not a member of this project.'});const title=req.body.title===undefined?old.title:String(req.body.title).trim(),description=req.body.description===undefined?old.description:String(req.body.description).trim(),status=req.body.status===undefined?old.status:req.body.status,priority=req.body.priority===undefined?old.priority:req.body.priority,assignee=req.body.assignee_id===undefined?old.assignee_id:(req.body.assignee_id?Number(req.body.assignee_id):null),due=req.body.due_date===undefined?old.due_date:(req.body.due_date||null);
 if(!title||title.length>180)return res.status(400).json({error:'Task title is required and must be under 180 characters.'});if(!['todo','progress','review','done'].includes(status)||!['low','medium','high','urgent'].includes(priority))return res.status(400).json({error:'Invalid status or priority.'});if(assignee&&!await isMember(old.project_id,assignee))return res.status(400).json({error:'Assignee must be a member of this project.'});
 await pool.query('UPDATE tasks SET title=?,description=?,status=?,priority=?,assignee_id=?,due_date=? WHERE id=?',[title,description,status,priority,assignee,due,id]);let action='updated task';if(status!==old.status)action=`moved task to ${status}`;await logActivity(old.project_id,req.user.id,id,action,title);if(assignee&&assignee!==old.assignee_id&&assignee!==req.user.id)await notify(assignee,old.project_id,id,`${req.user.name} assigned you: ${title}`,'assignment');const [rows]=await pool.query(`SELECT t.*,DATE_FORMAT(t.due_date,'%Y-%m-%d') due_date,a.name assignee_name,a.avatar_color assignee_color,c.name creator_name,(SELECT COUNT(*) FROM comments cm WHERE cm.task_id=t.id) comment_count FROM tasks t LEFT JOIN users a ON a.id=t.assignee_id JOIN users c ON c.id=t.creator_id WHERE t.id=?`,[id]);io.to(`project:${old.project_id}`).emit('task:updated',{projectId:old.project_id,task:rows[0]});res.json(rows[0]);
 }catch(e){console.error(e);res.status(500).json({error:'Could not update task.'});}
});
app.delete('/api/tasks/:id',auth,async(req,res)=>{try{const id=Number(req.params.id);const [rows]=await pool.query('SELECT * FROM tasks WHERE id=?',[id]);if(!rows.length)return res.status(404).json({error:'Task not found.'});const t=rows[0];if(!await isMember(t.project_id,req.user.id))return res.status(403).json({error:'You are not a member of this project.'});await logActivity(t.project_id,req.user.id,id,'deleted task',t.title);await pool.query('DELETE FROM tasks WHERE id=?',[id]);io.to(`project:${t.project_id}`).emit('task:deleted',{projectId:t.project_id,taskId:id});res.json({message:'Task deleted.'});}catch(e){console.error(e);res.status(500).json({error:'Could not delete task.'});}});
app.get('/api/tasks/:id/comments',auth,async(req,res)=>{try{const id=Number(req.params.id);const [t]=await pool.query('SELECT project_id FROM tasks WHERE id=?',[id]);if(!t.length)return res.status(404).json({error:'Task not found.'});if(!await isMember(t[0].project_id,req.user.id))return res.status(403).json({error:'You are not a member of this project.'});const [rows]=await pool.query('SELECT c.*,u.name user_name,u.avatar_color FROM comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=? ORDER BY c.created_at',[id]);res.json(rows);}catch(e){res.status(500).json({error:'Could not load comments.'});}});
app.post('/api/tasks/:id/comments',auth,async(req,res)=>{try{const id=Number(req.params.id),body=String(req.body.body||'').trim();if(!body||body.length>2000)return res.status(400).json({error:'Comment must be between 1 and 2000 characters.'});const [t]=await pool.query('SELECT * FROM tasks WHERE id=?',[id]);if(!t.length)return res.status(404).json({error:'Task not found.'});if(!await isMember(t[0].project_id,req.user.id))return res.status(403).json({error:'You are not a member of this project.'});const [r]=await pool.query('INSERT INTO comments(task_id,user_id,body) VALUES (?,?,?)',[id,req.user.id,body]);await logActivity(t[0].project_id,req.user.id,id,'commented on task',t[0].title);const [rows]=await pool.query('SELECT c.*,u.name user_name,u.avatar_color FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?',[r.insertId]);const comment=rows[0];io.to(`project:${t[0].project_id}`).emit('comment:created',{projectId:t[0].project_id,taskId:id,comment});const recipient=t[0].assignee_id;if(recipient&&recipient!==req.user.id)await notify(recipient,t[0].project_id,id,`${req.user.name} commented on: ${t[0].title}`,'comment');res.status(201).json(comment);}catch(e){console.error(e);res.status(500).json({error:'Could not add comment.'});}});
app.get('/api/notifications',auth,async(req,res)=>{try{const [rows]=await pool.query('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',[req.user.id]);res.json(rows);}catch(e){res.status(500).json({error:'Could not load notifications.'});}});
app.patch('/api/notifications/read-all',auth,async(req,res)=>{try{await pool.query('UPDATE notifications SET is_read=1 WHERE user_id=?',[req.user.id]);res.json({message:'Notifications marked as read.'});}catch(e){res.status(500).json({error:'Could not update notifications.'});}});
app.get('/api/projects/:id/activity',auth,async(req,res)=>{try{const id=Number(req.params.id);if(!await isMember(id,req.user.id))return res.status(403).json({error:'You are not a member of this project.'});const [rows]=await pool.query('SELECT l.*,u.name user_name,u.avatar_color FROM activity_logs l JOIN users u ON u.id=l.user_id WHERE l.project_id=? ORDER BY l.created_at DESC LIMIT 30',[id]);res.json(rows);}catch(e){res.status(500).json({error:'Could not load activity.'});}});

io.use((socket,next)=>{try{const token=socket.handshake.auth&&socket.handshake.auth.token;if(!token)return next(new Error('Authentication required'));const payload=jwt.verify(token,JWT_SECRET||'local-development-secret-change-me');socket.userId=payload.id;next();}catch(e){next(new Error('Invalid session'));}});
io.on('connection',socket=>{socket.join(`user:${socket.userId}`);socket.on('project:join',async projectId=>{const id=Number(projectId);if(id&&await isMember(id,socket.userId))socket.join(`project:${id}`);});socket.on('project:leave',projectId=>socket.leave(`project:${Number(projectId)}`));});
app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint not found.'}));
app.get('*',(_req,res)=>res.sendFile(require('path').join(__dirname,'public','index.html')));
server.listen(PORT,()=>console.log(`TaskFlow Pro running at http://localhost:${PORT}`));
