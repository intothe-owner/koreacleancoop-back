import { Router, Request, Response } from 'express';
import { BoardConfig } from '../models/BoardConfig';
import { Op } from 'sequelize';
const router = Router();

// 1. 전체 게시판 설정 목록 조회
router.get('/', async (req: Request, res: Response) => {
  try {
    const boardConfigs = await BoardConfig.findAll({
      order: [['createdAt', 'DESC']],
    });
    res.status(200).json({ success: true, data: boardConfigs });
  } catch (error) {
    console.error('게시판 설정 목록 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 2. 특정 게시판 설정 상세 조회
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const param = req.params.id; // Number()로 감싸지 않고 문자열 그대로 받음

    // findByPk 대신 findOne과 Op.or를 사용하여 다중 조건 검색
    const boardConfig = await BoardConfig.findOne({
      where: {
        [Op.or]: [
          { tableName: param }, // 영문 게시판 아이디(tableName) 매칭
          ...(isNaN(Number(param)) ? [] : [{ id: Number(param) }]) // 숫자 형태일 경우 id 매칭 포함
        ]
      }
    });
    
    if (!boardConfig) {
      return res.status(404).json({ success: false, message: '게시판 설정을 찾을 수 없습니다.' });
    }
    
    res.status(200).json({ success: true, data: boardConfig });
  } catch (error) {
    console.error('게시판 설정 상세 조회 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 3. 새 게시판 설정 생성
// 3. 새 게시판 설정 생성 (usePush 값 포함)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { tableName } = req.body;

    const existingBoard = await BoardConfig.findOne({ where: { tableName } });
    if (existingBoard) {
      return res.status(400).json({ success: false, message: '이미 존재하는 게시판 아이디(영문)입니다.' });
    }

    // ✨ req.body에 usePush 필드가 포함되어 있으면 자동으로 DB에 반영됩니다.
    const newBoardConfig = await BoardConfig.create(req.body);

    res.status(201).json({ success: true, data: newBoardConfig, message: '게시판 설정이 생성되었습니다.' });
  } catch (error) {
    console.error('게시판 설정 생성 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 4. 게시판 설정 수정 (usePush 값 포함)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const boardId = Number(req.params.id);
    const updateData = req.body; // ✨ 프론트엔드에서 수정한 usePush 값도 이곳에 포함됨
    
    if (updateData.tableName) {
        const existingBoard = await BoardConfig.findOne({ where: { tableName: updateData.tableName } });
        if (existingBoard && existingBoard.getDataValue('id') !== boardId) {
             return res.status(400).json({ success: false, message: '이미 존재하는 게시판 아이디(영문)입니다.' });
        }
    }

    const [updatedRows] = await BoardConfig.update(updateData, { 
      where: { id: boardId } 
    });

    if (updatedRows === 0) {
        return res.status(404).json({ success: false, message: '수정할 게시판 설정을 찾을 수 없거나 변경된 내용이 없습니다.' });
    }
    
    const updatedBoardConfig = await BoardConfig.findByPk(boardId);
    res.status(200).json({ success: true, data: updatedBoardConfig, message: '게시판 설정이 수정되었습니다.' });
  } catch (error) {
    console.error('게시판 설정 수정 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 5. 게시판 설정 삭제 (Soft Delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const boardId = Number(req.params.id);
    const deletedRows = await BoardConfig.destroy({ where: { id: boardId } });
    
    if (deletedRows === 0) {
        return res.status(404).json({ success: false, message: '삭제할 게시판 설정을 찾을 수 없습니다.' });
    }
    res.status(200).json({ success: true, message: '게시판 설정이 삭제되었습니다.' });
  } catch (error) {
    console.error('게시판 설정 삭제 오류:', error);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

export default router;