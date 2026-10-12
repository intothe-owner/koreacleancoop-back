import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class SocialContribution extends Model {}

SocialContribution.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false, comment: '제목' },
  content: { type: DataTypes.TEXT, allowNull: false, comment: '내용' },
  author: { type: DataTypes.STRING, allowNull: false, defaultValue: '관리자', comment: '작성자' },
  views: { type: DataTypes.INTEGER, defaultValue: 0, comment: '조회수' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, comment: '사이트 노출 여부' },
  // ✨ 게시판(Board) 구조와 동일하게 파일 관리를 위한 컬럼 추가
  mediaUrls: { type: DataTypes.TEXT, allowNull: true, comment: '첨부파일/이미지 URL 배열(JSON)' },
  thumbnailUrl: { type: DataTypes.STRING, allowNull: true, comment: '썸네일 URL' }
}, { 
  sequelize, 
  tableName: 'social_contributions',
  comment: '사회적공헌활동 게시판 테이블' 
});