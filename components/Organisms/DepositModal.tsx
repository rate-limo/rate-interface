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
import { DepositModalHeader } from '../Molecules/DepositModalHeader';
import { DepositModalContent } from '../Molecules/DepositModalContent';

interface DepositModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  defaultOpen?: boolean;
}

export function DepositModal({
  open,
  onOpenChange,
  trigger,
  defaultOpen,
}: DepositModalProps) {
  const [currentState, setCurrentState] = useState<"start" | "processing" | "success" | "fail">("start");

  useEffect(() => {
    setCurrentState("start");
  }, [open])
  
  const handleButtonClick = () => {
    if (currentState === "start") {
      setCurrentState("processing");
    } else if (currentState === "processing") {
      const num = Math.round(Math.random() * 100)
      if (num % 2 === 0)
        setCurrentState("success");
      else
        setCurrentState("fail")
    } else {
      onOpenChange && onOpenChange(false)
    }
  }

  const getButtonLabel = (state: "start" | "processing" | "success" | "fail") => {
    switch (state) {
      case 'start':
        return "Establish Connection"
      case 'processing':
        return "Deposit";
      case "success":
        return "Close"
      case "fail":
        return "Close"
      default:
        return "Establish Connection"
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="bg-neutral-dark-default border-neutral-light-white-12 !w-[574px] !max-w-[574px] border p-0 gap-0 rounded-3xl shadow-none">
        <DialogHeader className="border-neutral-light-white-12 w-full border-b p-4">
          <div className="flex w-full items-center gap-2">
            <DialogTitle className="w-full ">
              <DepositModalHeader
                depositStatus={currentState}
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
          <DepositModalContent depositStatus={currentState} amountAvailable={1000}/>
        </div>

        <div className="p-4">
            <Button
              size="md"
              className="w-full bg-purple-400 font-medium text-on-primary hover:bg-purple-500"
              onClick={handleButtonClick}
            >
              {getButtonLabel(currentState)}
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


