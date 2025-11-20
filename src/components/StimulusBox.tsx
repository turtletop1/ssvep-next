import React from 'react';
import { Box, Typography } from '@mui/material';
import { useDraggable } from '@dnd-kit/core';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { useStore, type StimulusItem } from '../stores/canvasStore';

interface StimulusBoxProps {
  item: StimulusItem;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function StimulusBox({ item, onClick, style }: StimulusBoxProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const { selectedItemId, globalConfig, stimulationState } = useStore();

  const isSelected = selectedItemId === item.id;

  // 當前刺激的亮度（0~1）
  const currentStimulationState = stimulationState[item.id];
  const brightness = currentStimulationState?.brightness ?? 1;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) onClick();
  };

  return (
    <Box
      ref={setNodeRef}
      style={{
        ...style,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      onClick={handleClick}
      sx={{
        position: 'relative',
        width: item.size.width,
        height: item.size.height,
        border: globalConfig.isRunning
          ? '2px solid transparent'
          : isSelected
            ? '2px solid #1976d2'
            : '2px solid rgba(0, 0, 0, 0.12)',
        borderRadius: 1,
        overflow: 'hidden',               // 重要：防止圖片溢出圓角
        cursor: 'pointer',
        background: item.imageUrl
          ? `url(${item.imageUrl}) center/cover no-repeat`
          : item.color,
        // 圖片模式用 filter 控制明暗，純色模式用 opacity（兩者效果一致）
        filter: item.imageUrl && globalConfig.isRunning
          ? `brightness(${brightness})`
          : undefined,
        opacity: !item.imageUrl && globalConfig.isRunning
          ? brightness
          : isDragging
            ? 0.5
            : 1,
        transition: globalConfig.isRunning ? 'none' : 'all 0.2s ease',
        userSelect: 'none',
        '&:hover': {
          border: isSelected ? '2px solid #1976d2' : '2px solid rgba(0, 0, 0, 0.5)',
          boxShadow: 6,
        },
      }}
    >
      {/* 拖拽手柄（僅在編輯模式顯示） */}
      {!globalConfig.isRunning && (
        <Box
          {...listeners}
          {...attributes}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: 10,
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none',
            color: 'rgba(0, 0, 0, 0.54)',
            padding: '4px',
            borderRadius: '50%',
            '&:hover': {
              bgcolor: 'rgba(0, 0, 0, 0.08)',
            },
          }}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
      )}

      {/* 文字 + 頻率標籤 */}
      <Typography
        variant="body2"
        sx={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          bg: 'rgba(0,0,0,0.5)',
          color: '#fff',
          px: 1.5,
          py: 0.5,
          borderRadius: 1,
          fontWeight: 'bold',
          fontSize: Math.min(item.size.width, item.size.height) / 10,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(2px)',
        }}
      >
        {item.text}
      </Typography>

      {/* 編輯模式下額外顯示頻率（角落） */}
      {!globalConfig.isRunning && (
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            top: 6,
            left: 6,
            color: 'rgba(0,0,0,0.6)',
            bgcolor: 'rgba(255,255,255,0.8)',
            px: 1,
            py: 0.3,
            borderRadius: 1,
            fontWeight: 'medium',
            pointerEvents: 'none',
          }}
        >
          {item.frequency} Hz
        </Typography>
      )}
    </Box>
  );
}