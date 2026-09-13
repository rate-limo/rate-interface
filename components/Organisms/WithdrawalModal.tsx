'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useEffect, useState, type ReactNode } from 'react';
import { WithdrawModalHeader } from '../Molecules/WithdrawalModalHeader';
import { WithdrawModalContent } from '../Molecules/WithdrawalModalContent';

interface WithdrawalModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  defaultOpen?: boolean;
}

export function WithdrawalModal({
  open,
  onOpenChange,
  trigger,
  defaultOpen,
}: WithdrawalModalProps) {
  const [currentState, setCurrentState] = useState<"start" | "processing" | "success">("start");
  
  useEffect(() => {
    setCurrentState("start");
  }, [open])
  
  const handleButtonClick = () => {
    if (currentState === "start") {
      setCurrentState("processing");
    } else if (currentState === "processing") {
      setCurrentState("success");
    } else {
      onOpenChange && onOpenChange(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="bg-neutral-dark-default border-neutral-light-white-12 !w-[574px] !max-w-[574px] border p-0 gap-0 rounded-3xl shadow-none">
        <DialogHeader className="border-neutral-light-white-12 w-full border-b p-4">
          <div className="flex w-full items-center gap-2">
            <DialogTitle className="w-full ">
              <WithdrawModalHeader
                withdrawalStatus={currentState}
                onClose={() => {
                  onOpenChange && onOpenChange(false)
                  //setCurrentState("start");
                }}
              />
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="py-4 px-4 pb-8 border-b  border-neutral-light-white-12 ">
          {/* Content */}
          <WithdrawModalContent withdrawalStatus={currentState} amountAvailable={1000}/>
        </div>

        <div className="p-4">
            <Button
              size="md"
              className="w-full bg-purple-400 font-medium text-on-primary hover:bg-purple-500"
              onClick={handleButtonClick}
            >
              Withdraw from L1
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

