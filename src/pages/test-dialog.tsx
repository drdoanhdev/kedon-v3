'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '../components/ui/dialog';
import { Button } from '../components/ui/button';

export default function TestDialogPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-10">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => setOpen(true)}>Mở popup</Button>
        </DialogTrigger>
        <DialogContent>
          <p>Nội dung test Dialog</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
