import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemRow } from './ListDetailPage';

const item = { id: 'item-1', name: 'Milk', quantity: 1, checked: false };

describe('ItemRow tapping', () => {
  it('toggles from the row by default and excludes delete', () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(<ItemRow item={item} groupId="g" onToggle={onToggle} onDelete={onDelete} onEdit={vi.fn()} tapMode="row" />);
    fireEvent.click(screen.getByText('Milk'));
    expect(onToggle).toHaveBeenCalledWith(item);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(onDelete).toHaveBeenCalledWith('item-1');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('limits tapping to the checkbox when requested', () => {
    const onToggle = vi.fn();
    render(<ItemRow item={item} groupId="g" onToggle={onToggle} onDelete={vi.fn()} onEdit={vi.fn()} tapMode="checkbox" />);
    fireEvent.click(screen.getByText('Milk'));
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onToggle).toHaveBeenCalledWith(item);
  });
});
