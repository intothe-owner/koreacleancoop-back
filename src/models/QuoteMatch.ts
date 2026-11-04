import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class QuoteMatch extends Model {}

QuoteMatch.init({
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  quoteRequestId: { 
    type: DataTypes.INTEGER, 
    allowNull: false, 
    comment: '견적 요청 ID' 
  },
  memberId: { 
    type: DataTypes.INTEGER, 
    allowNull: false, 
    comment: '매칭 대상 업체(Member) ID' 
  },
  distance: { 
    type: DataTypes.DECIMAL(10, 2), 
    allowNull: false, 
    comment: '고객과 업체 간의 실제 거리 (km)' 
  },
  matchStage: { 
    type: DataTypes.INTEGER, 
    allowNull: false, 
    comment: '매칭이 발생한 반경 단계 (0~5)' 
  },
  proposedPrice: { 
    type: DataTypes.INTEGER, 
    allowNull: true, 
    comment: '업체가 제안한 견적가' 
  },
  memo: { 
    type: DataTypes.TEXT, 
    allowNull: true, 
    comment: '업체 전달 메모' 
  },
  status: { 
    type: DataTypes.ENUM('WAITING', 'PROPOSED', 'ACCEPTED', 'REJECTED'), 
    defaultValue: 'WAITING', 
    comment: '매칭 및 입찰 상태' 
  }
}, { 
  sequelize, 
  tableName: 'quote_matches',
  comment: '견적-업체 매칭 및 입찰 내역 테이블',
  indexes: [
    {
      unique: true,
      fields: ['quoteRequestId', 'memberId'] // 동일 견적에 중복 매칭 방지
    }
  ]
});