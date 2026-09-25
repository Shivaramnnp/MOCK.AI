import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function classroomDevPlugin(): Plugin {
  const localDbFile = path.resolve(__dirname, '.classroom.local.json');

  const loadDb = (): { classes: any[]; assignments: any[] } => {
    try {
      if (fs.existsSync(localDbFile)) {
        return JSON.parse(fs.readFileSync(localDbFile, 'utf-8'));
      }
    } catch {}
    return { classes: [], assignments: [] };
  };

  const saveDb = (db: { classes: any[]; assignments: any[] }) => {
    try {
      fs.writeFileSync(localDbFile, JSON.stringify(db, null, 2), 'utf-8');
    } catch {}
  };

  return {
    name: 'classroom-dev-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/classroom')) {
          return next();
        }

        const parseBody = (cb: (body: any) => void) => {
          let data = '';
          req.on('data', (chunk) => (data += chunk));
          req.on('end', () => {
            try {
              cb(data ? JSON.parse(data) : {});
            } catch {
              cb({});
            }
          });
        };

        const json = (data: any, status = 200) => {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = status;
          res.end(JSON.stringify(data));
        };

        const urlPath = req.url.split('?')[0];
        const db = loadDb();

        if (req.method === 'GET' && urlPath === '/api/classroom/classes') {
          return json(db.classes);
        }

        if (req.method === 'POST' && urlPath === '/api/classroom/classes') {
          return parseBody((newClass) => {
            if (newClass && (newClass.classId || newClass.id || newClass.joinCode)) {
              const id = newClass.classId || newClass.id;
              const idx = db.classes.findIndex(
                (c) =>
                  (id && (c.classId || c.id) === id) ||
                  (newClass.joinCode &&
                    c.joinCode?.trim().toUpperCase() === newClass.joinCode?.trim().toUpperCase())
              );
              if (idx >= 0) {
                const existing = db.classes[idx];
                const mergedStudentIds = Array.from(
                  new Set([...(existing.studentIds || []), ...(newClass.studentIds || [])])
                );
                const mergedStudentNames = {
                  ...(existing.studentNames || {}),
                  ...(newClass.studentNames || {}),
                };
                db.classes[idx] = {
                  ...existing,
                  ...newClass,
                  studentIds: mergedStudentIds,
                  studentNames: mergedStudentNames,
                };
              } else {
                db.classes.unshift(newClass);
              }
              saveDb(db);
            }
            return json({ success: true, classes: db.classes });
          });
        }

        if (req.method === 'POST' && urlPath === '/api/classroom/join') {
          return parseBody(({ joinCode, studentId, studentName }) => {
            const clean = (joinCode || '').trim().toUpperCase();
            const target = db.classes.find(
              (c) => c.joinCode && c.joinCode.trim().toUpperCase() === clean
            );
            if (!target) {
              return json({
                success: false,
                message: 'Class not found. Please verify the code with your instructor.',
              });
            }
            if (target.teacherId === studentId) {
              return json({
                success: false,
                message: 'You are the instructor of this class.',
              });
            }
            if (!target.studentIds) target.studentIds = [];
            if (!target.studentNames) target.studentNames = {};
            if (!target.studentIds.includes(studentId)) {
              target.studentIds.push(studentId);
              target.studentNames[studentId] = studentName || `Scholar ${studentId.slice(-4)}`;
              saveDb(db);
            }
            return json({
              success: true,
              message: `Successfully enrolled in ${target.name}!`,
              class: target,
            });
          });
        }

        if (req.method === 'POST' && urlPath === '/api/classroom/delete-class') {
          return parseBody(({ classId }) => {
            db.classes = db.classes.filter((c) => (c.classId || c.id) !== classId);
            db.assignments = db.assignments.filter((a) => a.classId !== classId);
            saveDb(db);
            return json({ success: true });
          });
        }

        if (req.method === 'POST' && urlPath === '/api/classroom/leave') {
          return parseBody(({ classId, studentId }) => {
            const target = db.classes.find((c) => (c.classId || c.id) === classId);
            if (target) {
              if (target.studentIds) {
                target.studentIds = target.studentIds.filter((id: string) => id !== studentId);
              }
              if (target.studentNames && target.studentNames[studentId]) {
                delete target.studentNames[studentId];
              }
              saveDb(db);
            }
            return json({ success: true });
          });
        }

        if (req.method === 'GET' && urlPath === '/api/classroom/assignments') {
          return json(db.assignments);
        }

        if (req.method === 'POST' && urlPath === '/api/classroom/assignments') {
          return parseBody((newAsg) => {
            if (newAsg && (newAsg.assignmentId || newAsg.id)) {
              const id = newAsg.assignmentId || newAsg.id;
              const idx = db.assignments.findIndex((a) => (a.assignmentId || a.id) === id);
              if (idx >= 0) db.assignments[idx] = newAsg;
              else db.assignments.unshift(newAsg);
              saveDb(db);
            }
            return json({ success: true, assignments: db.assignments });
          });
        }

        if (req.method === 'POST' && urlPath === '/api/classroom/delete-assignment') {
          return parseBody(({ assignmentId }) => {
            db.assignments = db.assignments.filter((a) => (a.assignmentId || a.id) !== assignmentId);
            saveDb(db);
            return json({ success: true });
          });
        }

        if (req.method === 'POST' && urlPath === '/api/classroom/submit') {
          return parseBody(({ assignmentId, studentId, score, total, studentName }) => {
            const asg = db.assignments.find((a) => (a.assignmentId || a.id) === assignmentId);
            if (asg) {
              if (!asg.studentSubmissions) asg.studentSubmissions = {};
              asg.studentSubmissions[studentId] = {
                status: 'SUBMITTED',
                score,
                total,
                scorePercent: total > 0 ? Math.round((score * 100) / total) : 0,
                submittedAt: Date.now(),
                studentName,
              };
              saveDb(db);
            }
            return json({ success: true, assignment: asg });
          });
        }

        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), classroomDevPlugin()],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('katex')) return 'katex';
            return 'vendor';
          }
          for (const year of ['2025', '2024', '2023', '2022', '2021', '2020', '2019']) {
            if (id.includes(`ssc-chsl-${year}`)) return `ssc-chsl-${year}`;
            if (id.includes(`gate-${year}`)) return `gate-${year}`;
          }
        },
      },
    },
  },
});
