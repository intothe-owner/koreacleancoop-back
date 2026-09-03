// src/models/index.ts
import { SiteSetting } from './SiteSetting';
import { Menu } from './Menu';
import { Page } from './Page';
import { BoardConfig } from './BoardConfig';
import { Post } from './Post';
import { Comment } from './Comment';
import { MemberSetting } from './MemberSetting';
import { Member } from './Member';
import { VisitorLog } from './VisitorLog';
import { Policy } from './Policy';
import { Certification } from './Certification';
import { CoopMember } from './CoopMember';
import { CertificationExam } from './CertificationExam';
import { Question } from './Question';
import { ExamSession } from './ExamSession';
import { UserAnswer } from './UserAnswer';

// --- 테이블 간의 관계(Relation) 정의 ---

// 1. 메뉴-메뉴 (자기참조)
Menu.hasMany(Menu, { as: 'subMenus', foreignKey: 'parentId', onDelete: 'CASCADE' });
Menu.belongsTo(Menu, { as: 'parentMenu', foreignKey: 'parentId' });

// 2. 메뉴-페이지 (메뉴 삭제 시 연결된 페이지 설정도 논리 삭제)
Menu.hasOne(Page, { foreignKey: 'menuId', onDelete: 'CASCADE' });
Page.belongsTo(Menu, { foreignKey: 'menuId' });

// 3. 메뉴-게시판설정 (메뉴 삭제 시 게시판도 종속적으로 논리 삭제)
Menu.hasOne(BoardConfig, { foreignKey: 'menuId', onDelete: 'CASCADE' });
BoardConfig.belongsTo(Menu, { foreignKey: 'menuId' });

// 4. 게시판설정-게시물 (게시판 삭제 시 안에 든 글들도 삭제)
BoardConfig.hasMany(Post, { foreignKey: 'boardConfigId', onDelete: 'CASCADE' });
Post.belongsTo(BoardConfig, { foreignKey: 'boardConfigId' });

// 5. 게시물-댓글 (글 삭제 시 댓글도 삭제)
Post.hasMany(Comment, { foreignKey: 'postId', onDelete: 'CASCADE' }); 
Comment.belongsTo(Post, { foreignKey: 'postId' });
 
// (선택) 회원-게시물 관계 설정
Member.hasMany(Post, { foreignKey: 'memberId' });
Post.belongsTo(Member, { foreignKey: 'memberId' });


// 1. 시험(1) - 문제(N) : 한 시험에 50개의 문제가 들어감
CertificationExam.hasMany(Question, { foreignKey: 'examId', as: 'questions', onDelete: 'CASCADE' });
Question.belongsTo(CertificationExam, { foreignKey: 'examId', as: 'exam' });

// 2. 시험(1) - 수강생응시내역(N) : 하나의 시험을 여러 수강생이 침
CertificationExam.hasMany(ExamSession, { foreignKey: 'examId', as: 'sessions', onDelete: 'CASCADE' });
ExamSession.belongsTo(CertificationExam, { foreignKey: 'examId', as: 'exam' });

// 3. 수강생[회원](1) - 응시내역(N) : 회원은 여러 회차의 시험을 칠 수 있음
Member.hasMany(ExamSession, { foreignKey: 'memberId', as: 'examSessions' });
ExamSession.belongsTo(Member, { foreignKey: 'memberId', as: 'student' });

// 4. 응시내역(1) - 사용자답안(N) : 한 번 응시할 때 30개의 답안이 생성됨
ExamSession.hasMany(UserAnswer, { foreignKey: 'sessionId', as: 'answers', onDelete: 'CASCADE' });
UserAnswer.belongsTo(ExamSession, { foreignKey: 'sessionId', as: 'session' });

// 5. 문제(1) - 사용자답안(N) : 한 문제가 여러 수강생의 답안과 매칭됨
Question.hasMany(UserAnswer, { foreignKey: 'questionId' });
UserAnswer.belongsTo(Question, { foreignKey: 'questionId', as: 'questionInfo' });
export { 
    Menu, 
    Page, 
    BoardConfig, 
    Post, 
    Comment, 
    SiteSetting, 
    Member,
    MemberSetting,
    VisitorLog,
    Policy, 
    Certification,
    CoopMember
};