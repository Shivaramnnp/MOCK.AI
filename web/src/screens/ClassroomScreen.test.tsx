import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ClassroomScreen } from './ClassroomScreen';
import { ClassModel, AssignmentModel, UserProfile, TestHistory } from '../types';

describe('ClassroomScreen Component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const teacherProfile: UserProfile = {
    uid: 'teacher-1',
    fullName: 'Professor Smith',
    email: 'smith@mock.ai',
    role: 'TEACHER',
    createdAt: Date.now(),
  };

  const studentProfile: UserProfile = {
    uid: 'stu-1',
    fullName: 'Aarav Sharma',
    email: 'aarav@mock.ai',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  const sampleClass: ClassModel = {
    classId: 'class-1',
    name: 'Advanced Physics 101',
    teacherId: 'teacher-1',
    teacherName: 'Professor Smith',
    joinCode: 'PHY101',
    studentIds: ['stu-1', 'stu-2'],
    studentNames: {
      'stu-1': 'Aarav Sharma',
      'stu-2': 'Priya Iyer',
    },
    createdAt: Date.now(),
  };

  const sampleAssignment: AssignmentModel = {
    assignmentId: 'asg-1',
    classId: 'class-1',
    className: 'Advanced Physics 101',
    testTitle: 'Kinematics Quiz',
    assignedBy: 'teacher-1',
    assignedByName: 'Professor Smith',
    dueDate: Date.now() + 86400000 * 3,
    assignedAt: Date.now(),
    questions: [
      {
        id: 'q1',
        questionText: 'What is acceleration due to gravity?',
        options: ['9.8 m/s²', '12 m/s²', '5 m/s²', '0 m/s²'],
        correctAnswerIndex: 0,
        explanation: 'Standard g on earth is 9.8 m/s².',
      },
    ],
    studentSubmissions: {
      'stu-1': {
        status: 'SUBMITTED',
        score: 1,
        total: 1,
        scorePercent: 100,
        submittedAt: Date.now(),
        studentName: 'Aarav Sharma',
      },
    },
  };

  const sampleTests: TestHistory[] = [
    {
      id: 'test-1',
      title: 'Kinematics Quiz',
      category: 'Physics',
      questions: sampleAssignment.questions,
      createdAt: Date.now(),
      lastTakenAt: null,
      bestScore: null,
      bestScorePercent: null,
      bestTotal: 1,
    },
  ];

  it('renders Teacher Hub correctly with active classes and assignments', () => {
    const handleCreateClass = vi.fn();
    const handleJoinClass = vi.fn();
    const handleCreateAssignment = vi.fn();
    const handleTakeAssignment = vi.fn();

    render(
      <ClassroomScreen
        profile={teacherProfile}
        classes={[sampleClass]}
        assignments={[sampleAssignment]}
        tests={sampleTests}
        onCreateClass={handleCreateClass}
        onJoinClass={handleJoinClass}
        onCreateAssignment={handleCreateAssignment}
        onTakeAssignment={handleTakeAssignment}
      />
    );

    expect(screen.getByText('Teacher Classroom Hub')).toBeDefined();
    expect(screen.getByText('Create New Class')).toBeDefined();
    expect(screen.getByText('Advanced Physics 101')).toBeDefined();
    expect(screen.getByText('PHY101')).toBeDefined();
  });

  it('allows teacher to create a new class via modal', () => {
    const handleCreateClass = vi.fn();

    render(
      <ClassroomScreen
        profile={teacherProfile}
        classes={[]}
        assignments={[]}
        tests={sampleTests}
        onCreateClass={handleCreateClass}
        onJoinClass={vi.fn()}
        onCreateAssignment={vi.fn()}
        onTakeAssignment={vi.fn()}
      />
    );

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /Create New Class/i }));
    expect(screen.getByText('Create New Classroom')).toBeDefined();

    // Type name and submit
    const input = screen.getByPlaceholderText(/e\.g\. Grade 12 Physics/i);
    fireEvent.change(input, { target: { value: 'Grade 11 Chemistry' } });

    const submitBtn = screen.getByRole('button', { name: /^Create Class$/i });
    fireEvent.click(submitBtn);

    expect(handleCreateClass).toHaveBeenCalledWith('Grade 11 Chemistry');
  });

  it('allows teacher to open roster modal and inspect enrolled students', () => {
    render(
      <ClassroomScreen
        profile={teacherProfile}
        classes={[sampleClass]}
        assignments={[sampleAssignment]}
        tests={sampleTests}
        onCreateClass={vi.fn()}
        onJoinClass={vi.fn()}
        onCreateAssignment={vi.fn()}
        onTakeAssignment={vi.fn()}
      />
    );

    const rosterBtn = screen.getByRole('button', { name: /^Roster$/i });
    fireEvent.click(rosterBtn);

    expect(screen.getByText(/Class Roster: Advanced Physics 101/i)).toBeDefined();
    expect(screen.getAllByText('Aarav Sharma').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Priya Iyer').length).toBeGreaterThanOrEqual(2);

    // Close roster
    fireEvent.click(screen.getByRole('button', { name: /Close Roster/i }));
    expect(screen.queryByText(/Class Roster: Advanced Physics 101/i)).toBeNull();
  });

  it('renders Student view and handles joining a class with code', () => {
    const handleJoinClass = vi.fn().mockReturnValue({ success: true, message: 'Enrolled!' });

    render(
      <ClassroomScreen
        profile={studentProfile}
        classes={[sampleClass]}
        assignments={[sampleAssignment]}
        tests={[]}
        onCreateClass={vi.fn()}
        onJoinClass={handleJoinClass}
        onCreateAssignment={vi.fn()}
        onTakeAssignment={vi.fn()}
      />
    );

    expect(screen.getByText('Student Classrooms')).toBeDefined();
    expect(screen.getByText('Join Class with Code')).toBeDefined();

    // Open Join Modal
    fireEvent.click(screen.getByRole('button', { name: /Join Class with Code/i }));
    expect(screen.getByText('Join Classroom')).toBeDefined();

    // Enter code
    const codeInput = screen.getByPlaceholderText('e.g. PHY981');
    fireEvent.change(codeInput, { target: { value: 'PHY101' } });

    // Submit
    const enrollBtn = screen.getByRole('button', { name: /Enroll Now/i });
    fireEvent.click(enrollBtn);

    expect(handleJoinClass).toHaveBeenCalledWith('PHY101');
  });

  it('displays error in join modal when invalid code is submitted', async () => {
    const handleJoinClass = vi.fn().mockResolvedValue({ success: false, message: 'Class not found.' });

    render(
      <ClassroomScreen
        profile={studentProfile}
        classes={[]}
        assignments={[]}
        tests={[]}
        onCreateClass={vi.fn()}
        onJoinClass={handleJoinClass}
        onCreateAssignment={vi.fn()}
        onTakeAssignment={vi.fn()}
      />
    );

    // Open Join Modal
    fireEvent.click(screen.getByRole('button', { name: /Join Class with Code/i }));
    const codeInput = screen.getByPlaceholderText('e.g. PHY981');
    fireEvent.change(codeInput, { target: { value: 'WRONG1' } });

    const enrollBtn = screen.getByRole('button', { name: /Enroll Now/i });
    fireEvent.click(enrollBtn);

    expect(await screen.findByText('Class not found.')).toBeDefined();
  });

  it('allows student to launch an assigned test via onTakeAssignment', () => {
    const handleTakeAssignment = vi.fn();

    render(
      <ClassroomScreen
        profile={studentProfile}
        classes={[sampleClass]}
        assignments={[sampleAssignment]}
        tests={[]}
        onCreateClass={vi.fn()}
        onJoinClass={vi.fn()}
        onCreateAssignment={vi.fn()}
        onTakeAssignment={handleTakeAssignment}
      />
    );

    // Switch to Assignments tab
    const assignmentsTabBtn = screen.getByRole('button', { name: /Assignments/i });
    fireEvent.click(assignmentsTabBtn);

    expect(screen.getByText('Kinematics Quiz')).toBeDefined();
    const retakeBtn = screen.getByRole('button', { name: /Retake Exam/i });
    fireEvent.click(retakeBtn);

    expect(handleTakeAssignment).toHaveBeenCalledWith(sampleAssignment);
  });

  it('shows submissions & grades tab for teachers with student scores', () => {
    render(
      <ClassroomScreen
        profile={teacherProfile}
        classes={[sampleClass]}
        assignments={[sampleAssignment]}
        tests={sampleTests}
        onCreateClass={vi.fn()}
        onJoinClass={vi.fn()}
        onCreateAssignment={vi.fn()}
        onTakeAssignment={vi.fn()}
      />
    );

    // Click Submissions & Grades tab
    const gradesTabBtn = screen.getByRole('button', { name: /Submissions & Grades/i });
    fireEvent.click(gradesTabBtn);

    expect(screen.getByText('Aarav Sharma')).toBeDefined();
    expect(screen.getByText('1 / 1')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
    expect(screen.getByText('Graded')).toBeDefined();
  });
});
