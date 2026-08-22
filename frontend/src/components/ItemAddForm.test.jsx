import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ItemAddForm from './ItemAddForm';
import api from '../api/client';

vi.mock('../api/client', () => ({
  default: { createItem: vi.fn(), getSuggestions: vi.fn() },
}));

describe('optimistic item creation', () => {
  it('updates the UI before outbox persistence finishes', async () => {
    let finishPersistence;
    api.createItem.mockReturnValue(new Promise((resolve) => { finishPersistence = resolve; }));
    const onItemAdded = vi.fn();
    render(<ItemAddForm listId="list-1" categories={[]} onItemAdded={onItemAdded} />);

    fireEvent.change(screen.getByPlaceholderText('Add an item...'), { target: { value: 'Milk' } });
    fireEvent.submit(screen.getByPlaceholderText('Add an item...').closest('form'));

    expect(onItemAdded).toHaveBeenCalledTimes(1);
    expect(onItemAdded.mock.calls[0][0]).toMatchObject({ name: 'Milk', _pending: true });
    expect(onItemAdded.mock.calls[0][0].id).toMatch(/^[0-9a-f-]{36}$/);
    finishPersistence({});
    await waitFor(() => expect(screen.getByPlaceholderText('Add an item...')).toHaveValue(''));
  });
});
