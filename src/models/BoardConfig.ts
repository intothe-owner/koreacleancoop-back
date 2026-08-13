// src/models/BoardConfig.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class BoardConfig extends Model {}
BoardConfig.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  tableName: { type: DataTypes.STRING, unique: false, allowNull: false, comment: '게시판 아이디(영문)' },
  boardName: { type: DataTypes.STRING, allowNull: false, comment: '게시판 이름' },
  boardType: { type: DataTypes.ENUM('GENERAL', 'GALLERY', 'FAQ'), allowNull: false, comment: '게시판 타입' },
  
  categories: { type: DataTypes.STRING, allowNull: true, comment: '카테고리 목록(쉼표 구분)' },
  
  listCount: { type: DataTypes.INTEGER, defaultValue: 10, comment: '목록 수' },
  pageSize: { type: DataTypes.INTEGER, defaultValue: 10, comment: '페이징 설정' },
  readLevel: { type: DataTypes.INTEGER, defaultValue: 1, comment: '글읽기 권한(레벨)' },
  writeLevel: { type: DataTypes.INTEGER, defaultValue: 1, comment: '글쓰기 권한(레벨)' },
  deleteLevel: { type: DataTypes.INTEGER, defaultValue: 1, comment: '삭제 권한(레벨)' },
  useComment: { type: DataTypes.BOOLEAN, defaultValue: false, comment: '댓글 사용 여부' },
  commentWriteLevel: { type: DataTypes.INTEGER, defaultValue: 1, comment: '댓글 쓰기 권한' },
  
  // 💡 메인 노출 관련 속성
  showOnMain: { type: DataTypes.BOOLEAN, defaultValue: false, comment: '메인 노출 여부' },
  exposureOrder: { type: DataTypes.INTEGER, defaultValue: 0, comment: '메인 노출 순서' },
  mainExposureCount: { type: DataTypes.INTEGER, defaultValue: 5, comment: '메인 노출 개수' },
  
  useCaptcha: { type: DataTypes.BOOLEAN, defaultValue: true, comment: '비회원 자동등록방지' },
  useExtraFields: { type: DataTypes.BOOLEAN, defaultValue: false, comment: '필드 추가 기능 사용 여부' },
  extraFields: { type: DataTypes.JSON, allowNull: true, comment: '추가 필드 설정 배열 (JSON)' },
  
  galleryCols: { type: DataTypes.INTEGER, defaultValue: 3, comment: '갤러리 열 개수' },
  galleryRows: { type: DataTypes.INTEGER, defaultValue: 3, comment: '갤러리 행 개수' },
  useVideo: { type: DataTypes.BOOLEAN, defaultValue: false, comment: '동영상 업로드 허용' },
  videoAutoPlay: { type: DataTypes.BOOLEAN, defaultValue: false, comment: '동영상 자동재생' },
  
  fileUploadCount: { type: DataTypes.INTEGER, defaultValue: 2, comment: '파일 첨부 개수' },
  useEditor: { type: DataTypes.BOOLEAN, defaultValue: true, comment: '에디터 사용 여부' },
}, { 
  sequelize, 
  tableName: 'board_configs',
  paranoid: true,
  comment: '게시판(일반/갤러리/FAQ) 생성 및 권한 옵션 설정 테이블'
});