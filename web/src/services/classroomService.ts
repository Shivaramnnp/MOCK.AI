import { ClassModel, AssignmentModel, Question, UserProfile } from '../types';
import { storage } from './storage';
import { supabaseService } from './supabase';

export class ClassroomService {
  /**
   * Sync any locally cached classes to the shared backend/dev server.
   * This ensures classes created in one browser profile (e.g. Safari Private)
   * are immediately registered with the server on load.
   */
  static async syncLocalToRemote(): Promise<void> {
    const localClasses = storage.getClasses();
    for (const cls of localClasses) {
      try {
        await fetch('/api/classroom/classes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cls),
        });
      } catch {
        // Dev server API not available (e.g., offline or pure static build)
      }
    }

    const localAssignments = storage.getAssignments();
    for (const asg of localAssignments) {
      try {
        await fetch('/api/classroom/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asg),
        });
      } catch {
        // Dev server API not available
      }
    }
  }

  /**
   * Fetch all classes across server, Supabase, and local storage, merging them safely.
   */
  static async getClasses(profile: UserProfile): Promise<ClassModel[]> {
    const localList = storage.getClasses();
    const mergedMap = new Map<string, ClassModel>();

    // 1. Seed with local classes
    localList.forEach((c) => mergedMap.set(c.classId, c));

    // 2. Fetch from shared dev server API (localhost multi-window sync)
    try {
      const res = await fetch('/api/classroom/classes');
      if (res.ok) {
        const remoteClasses: ClassModel[] = await res.json();
        remoteClasses.forEach((rc) => {
          const id = rc.classId || (rc as any).id;
          const existing = mergedMap.get(id);
          if (existing) {
            const mergedStudentIds = Array.from(
              new Set([...(existing.studentIds || []), ...(rc.studentIds || [])])
            );
            const mergedStudentNames = {
              ...(existing.studentNames || {}),
              ...(rc.studentNames || {}),
            };
            mergedMap.set(id, {
              ...existing,
              ...rc,
              studentIds: mergedStudentIds,
              studentNames: mergedStudentNames,
            });
          } else {
            mergedMap.set(id, rc);
          }
        });
      }
    } catch {
      // Dev API not reachable
    }

    // 3. Fetch from Supabase cloud database if available
    try {
      const client = supabaseService.getClient();
      if (client) {
        const { data: supaClasses } = await client.from('classes').select('*');
        if (supaClasses && Array.isArray(supaClasses)) {
          for (const sc of supaClasses) {
            const id = sc.id;
            const existing: ClassModel = mergedMap.get(id) || {
              classId: id,
              name: sc.name,
              teacherId: sc.teacher_id,
              teacherName: sc.teacher_name || '',
              joinCode: sc.join_code,
              studentIds: [],
              studentNames: {},
              createdAt: new Date(sc.created_at).getTime(),
            };

            // Query enrolled members for this class
            const { data: members } = await client
              .from('class_members')
              .select('*')
              .eq('class_id', id);

            if (members && Array.isArray(members)) {
              if (!existing.studentIds) existing.studentIds = [];
              if (!existing.studentNames) existing.studentNames = {};
              members.forEach((m: any) => {
                const sId = String(m.student_id || '');
                if (sId && !existing.studentIds.includes(sId)) {
                  existing.studentIds.push(sId);
                }
                if (sId && m.student_name) {
                  existing.studentNames[sId] = String(m.student_name);
                }
              });
            }
            mergedMap.set(id, existing);
          }
        }
      }
    } catch {
      // Supabase not reachable
    }

    const mergedList = Array.from(mergedMap.values());
    storage.saveClasses(mergedList);

    // Filter for visible classes
    const isTeacher = profile.role === 'TEACHER';
    return isTeacher
      ? mergedList.filter((c) => c.teacherId === profile.uid)
      : mergedList.filter((c) => c.studentIds?.includes(profile.uid));
  }

  /**
   * Create a new classroom and persist across local, dev server, and Supabase.
   */
  static async createClass(name: string, teacherId: string, teacherName: string): Promise<ClassModel> {
    const newClass = storage.createClass(name, teacherId, teacherName);

    // Sync to shared dev server API
    try {
      await fetch('/api/classroom/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClass),
      });
    } catch {
      // Dev API not reachable
    }

    // Sync to Supabase
    try {
      const client = supabaseService.getClient();
      if (client) {
        await client.from('classes').insert({
          id: newClass.classId,
          name: newClass.name,
          teacher_id: teacherId,
          teacher_name: teacherName,
          join_code: newClass.joinCode,
        });
      }
    } catch (err) {
      console.warn('Non-fatal: could not sync class to Supabase:', err);
    }

    return newClass;
  }

  /**
   * Student joins a class by 6-character code.
   * Checks local storage, shared dev server API, and Supabase database.
   */
  static async joinClass(
    joinCode: string,
    studentId: string,
    studentName: string
  ): Promise<{ success: boolean; message: string; targetClass?: ClassModel }> {
    if (!joinCode || !joinCode.trim()) {
      return { success: false, message: 'Please provide a valid 6-character join code.' };
    }
    const cleanCode = joinCode.trim().toUpperCase();

    // 1. Try local storage first
    const localRes = storage.joinClass(cleanCode, studentId, studentName);
    if (localRes.success) {
      const target = storage.getClasses().find((c) => c.joinCode?.toUpperCase() === cleanCode);
      // Sync local join to server
      if (target) {
        try {
          await fetch('/api/classroom/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(target),
          });
        } catch {}
      }
      return { success: true, message: localRes.message, targetClass: target };
    }

    // 2. Try shared dev server API (cross-window/cross-session on localhost)
    try {
      const res = await fetch('/api/classroom/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode: cleanCode, studentId, studentName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.class) {
          // Persist the enrolled class to the student's local storage
          const classes = storage.getClasses();
          const existingIdx = classes.findIndex((c) => c.classId === data.class.classId);
          if (existingIdx >= 0) {
            classes[existingIdx] = data.class;
          } else {
            classes.unshift(data.class);
          }
          storage.saveClasses(classes);
          return { success: true, message: data.message, targetClass: data.class };
        } else if (data.message && data.message !== 'Class not found. Please verify the code with your instructor.') {
          return { success: false, message: data.message };
        }
      }
    } catch {
      // Dev API not reachable
    }

    // 3. Try Supabase cloud database
    try {
      const client = supabaseService.getClient();
      if (client) {
        const { data: supaClass, error: findError } = await client
          .from('classes')
          .select('*')
          .eq('join_code', cleanCode)
          .maybeSingle();

        if (supaClass && !findError) {
          if (supaClass.teacher_id === studentId) {
            return { success: false, message: 'You are the instructor of this class.' };
          }

          // Insert into class_members in Supabase
          await client.from('class_members').upsert({
            class_id: supaClass.id,
            student_id: studentId,
            student_name: studentName,
          });

          // Construct and save locally
          const enrolledClass: ClassModel = {
            classId: supaClass.id,
            name: supaClass.name,
            teacherId: supaClass.teacher_id,
            teacherName: supaClass.teacher_name || '',
            joinCode: supaClass.join_code,
            studentIds: [studentId],
            studentNames: { [studentId]: studentName },
            createdAt: new Date(supaClass.created_at).getTime(),
          };

          const classes = storage.getClasses();
          const existingIdx = classes.findIndex((c) => c.classId === enrolledClass.classId);
          if (existingIdx >= 0) {
            classes[existingIdx] = enrolledClass;
          } else {
            classes.unshift(enrolledClass);
          }
          storage.saveClasses(classes);

          return {
            success: true,
            message: `Successfully enrolled in ${supaClass.name}!`,
            targetClass: enrolledClass,
          };
        }
      }
    } catch (err) {
      console.warn('Supabase join query error:', err);
    }

    return {
      success: false,
      message: 'Class not found. Please verify the code with your instructor.',
    };
  }

  /**
   * Delete class across local and remote.
   */
  static async deleteClass(classId: string): Promise<void> {
    storage.deleteClass(classId);

    try {
      await fetch('/api/classroom/delete-class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId }),
      });
    } catch {}

    try {
      const client = supabaseService.getClient();
      if (client) {
        await client.from('classes').delete().eq('id', classId);
      }
    } catch {}
  }

  /**
   * Leave class across local and remote.
   */
  static async leaveClass(classId: string, studentId: string): Promise<{ success: boolean; message: string }> {
    const res = storage.leaveClass(classId, studentId);

    try {
      await fetch('/api/classroom/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, studentId }),
      });
    } catch {}

    try {
      const client = supabaseService.getClient();
      if (client) {
        await client
          .from('class_members')
          .delete()
          .eq('class_id', classId)
          .eq('student_id', studentId);
      }
    } catch {}

    return res;
  }

  /**
   * Fetch all assignments across dev server and local storage.
   */
  static async getAssignments(profile: UserProfile): Promise<AssignmentModel[]> {
    const localList = storage.getAssignments();
    const mergedMap = new Map<string, AssignmentModel>();

    localList.forEach((a) => mergedMap.set(a.assignmentId, a));

    try {
      const res = await fetch('/api/classroom/assignments');
      if (res.ok) {
        const remoteAsgs: AssignmentModel[] = await res.json();
        remoteAsgs.forEach((ra) => {
          const id = ra.assignmentId || (ra as any).id;
          const existing = mergedMap.get(id);
          if (existing) {
            const mergedSubmissions = {
              ...(existing.studentSubmissions || {}),
              ...(ra.studentSubmissions || {}),
            };
            mergedMap.set(id, { ...existing, ...ra, studentSubmissions: mergedSubmissions });
          } else {
            mergedMap.set(id, ra);
          }
        });
      }
    } catch {}

    const mergedList = Array.from(mergedMap.values());
    storage.saveAssignments(mergedList);

    const isTeacher = profile.role === 'TEACHER';
    const classes = storage.getClasses();
    const enrolledClassIds = new Set(
      classes.filter((c) => c.studentIds?.includes(profile.uid)).map((c) => c.classId)
    );

    return isTeacher
      ? mergedList.filter((a) => a.assignedBy === profile.uid || classes.some((c) => c.classId === a.classId && c.teacherId === profile.uid))
      : mergedList.filter((a) => enrolledClassIds.has(a.classId));
  }

  /**
   * Create an assignment and sync to dev server.
   */
  static async createAssignment(
    classId: string,
    testTitle: string,
    questions: Question[],
    dueDate: number | null,
    teacherId: string,
    teacherName: string
  ): Promise<AssignmentModel> {
    const asg = storage.createAssignment(classId, testTitle, questions, dueDate, teacherId, teacherName);

    try {
      await fetch('/api/classroom/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asg),
      });
    } catch {}

    return asg;
  }

  /**
   * Delete an assignment.
   */
  static async deleteAssignment(assignmentId: string): Promise<void> {
    storage.deleteAssignment(assignmentId);

    try {
      await fetch('/api/classroom/delete-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      });
    } catch {}
  }

  /**
   * Submit an assignment test score.
   */
  static async submitAssignment(
    assignmentId: string,
    studentId: string,
    score: number,
    total: number,
    studentName?: string
  ): Promise<void> {
    storage.submitAssignment(assignmentId, studentId, score, total, studentName);

    try {
      await fetch('/api/classroom/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, studentId, score, total, studentName }),
      });
    } catch {}
  }
}
