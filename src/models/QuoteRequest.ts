import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class QuoteRequest extends Model {}

QuoteRequest.init({
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  customerName: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '고객명' 
  },
  customerPhone: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '연락처' 
  },
  address: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '서비스 주소' 
  },
  addressDetail:{
    type: DataTypes.STRING, 
    allowNull: false, 
    comment: '서비스 상세주소' 
  },
  latitude: { 
    type: DataTypes.DECIMAL(10, 7), 
    allowNull: false, 
    comment: '위도' 
  },
  longitude: { 
    type: DataTypes.DECIMAL(11, 7), 
    allowNull: false, 
    comment: '경도' 
  },
  location: { 
    type: DataTypes.GEOMETRY('POINT'), 
    allowNull: false, 
    comment: '공간 쿼리용 POINT 객체 (거리 계산용)' 
  },
  serviceType: { 
    type: DataTypes.ENUM('BUILDING', 'AIRCON', 'PEST', 'PUBLIC'), 
    allowNull: false, 
    comment: '서비스 종류' 
  },
  details: { 
    type: DataTypes.JSON, 
    allowNull: false, 
    comment: '서비스별 상세 견적 정보 (JSON 형식)' 
  },
  status: { 
    type: DataTypes.ENUM('PENDING', 'MATCHING', 'MATCHED', 'COMPLETED', 'PROPOSED', 'CANCELED'), 
    defaultValue: 'MATCHING', // 🌟 견적 등록과 동시에 매칭이 시작되므로 기본값을 MATCHING으로 설정
    comment: '진행 상태' 
  },
  currentMatchStage: { 
    type: DataTypes.INTEGER, 
    defaultValue: 0, 
    comment: '현재 매칭 단계 (0: 2~5km, 1: 6~10km, 2: 11~20km...)' 
  },
  preferredDate: { 
    type: DataTypes.DATE, 
    allowNull: true, 
    comment: '희망 시공일' 
  },
  memberId: { 
    type: DataTypes.INTEGER, 
    allowNull: true, 
    comment: '고객 회원 ID' 
  },
  
  // 🌟 [추가됨] 비회원 조회를 위한 비밀번호 컬럼
  password: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: '비회원 견적 조회용 비밀번호' 
  },

  matchedMemberId: { 
    type: DataTypes.INTEGER, 
    allowNull: true, 
    comment: '최종 매칭된 업체(Member) ID' 
  },
  reviewRating: { type: DataTypes.INTEGER, allowNull: true, comment: '고객 리뷰 평점 (1~5)' },
  reviewContent: { type: DataTypes.TEXT, allowNull: true, comment: '고객 리뷰 내용' },
  reviewReply: { type: DataTypes.TEXT, allowNull: true, comment: '업체 답글 내용' },
}, { 
  sequelize, 
  tableName: 'quote_requests',
  comment: '견적 요청 마스터 테이블',
  indexes: [
    {
      type: 'SPATIAL',
      fields: ['location'] 
    }
  ]
});