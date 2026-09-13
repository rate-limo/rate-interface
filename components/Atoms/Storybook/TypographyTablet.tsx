import React from 'react';

export function TypographyTablet() {
  return (
    <div className="min-h-screen bg-black p-8 md:p-12 lg:p-16">
      <div className="mx-auto max-w-7xl space-y-[200px] text-white">
        <h1 className="text-dh1 font-regular font-satoshi text-white">
          Typography <span className="italic text-[#A6ADE9]">Tablet</span>
        </h1>
        <div className="font-satoshi grid grid-cols-2 gap-8 font-regular">
          <div className="space-y-[80px]">
            <h1 className="text-td1">Display 1</h1>
            <h1 className="text-td2">Display 2</h1>
            <h1 className="text-td3">Display 3</h1>
            <h1 className="text-td4">Display 4</h1>
          </div>
          <div className="space-y-[80px] italic">
            <h1 className="text-td1">Display 1</h1>
            <h1 className="text-td2">Display 2</h1>
            <h1 className="text-td3">Display 3</h1>
            <h1 className="text-td4">Display 4</h1>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-[80px] font-semibold">
            <h1 className="text-th1">Heading 1</h1>
            <h2 className="text-th2">Heading 2</h2>
            <h3 className="text-th3">Heading 3</h3>
            <h4 className="text-th4">Heading 4</h4>
            <h5 className="text-th5">Heading 5</h5>
            <h6 className="text-th6">Heading 6</h6>
          </div>
          <div className="space-y-[80px] font-medium">
            <h1 className="text-th1">Heading 1</h1>
            <h2 className="text-th2">Heading 2</h2>
            <h3 className="text-th3">Heading 3</h3>
            <h4 className="text-th4">Heading 4</h4>
            <h5 className="text-th5">Heading 5</h5>
            <h6 className="text-th6">Heading 6</h6>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-8">
          <div className="space-y-8">
            <p className="text-body-caption font-regular">Caption regular</p>
            <p className="text-body-caption font-medium">Caption medium</p>
            <p className="text-body-caption font-semibold">Caption semibold</p>
            <p className="text-body-caption font-bold">Caption bold</p>
            <p className="text-body-caption font-link underline">
              <a href="https://example.com" >Caption link</a>
            </p>
          </div>
          <div className="space-y-8">
            <p className="text-body-default font-regular">Default regular</p>
            <p className="text-body-default font-medium">Default medium</p>
            <p className="text-body-default font-semibold">Default semibold</p>
            <p className="text-body-default font-bold">Default bold</p>
            <p  className="text-body-default font-link underline">
              <a href="https://example.com">Default link</a>
            </p>
          </div>
          <div className="space-y-8">
            <p className="text-body-lg font-regular">lg regular</p>
            <p className="text-body-lg font-medium">lg medium</p>
            <p className="text-body-lg font-semibold">lg semibold</p>
            <p className="text-body-lg font-bold">lg bold</p>
            <p  className="text-body-lg font-link underline">
              <a href="https://example.com">lg link</a>
            </p>
          </div>
          <div className="space-y-8">
            <p className="text-body-xl font-regular">xl regular</p>
            <p className="text-body-xl font-medium">xl medium</p>
            <p className="text-body-xl font-semibold">xl semibold</p>
            <p className="text-body-xl font-bold">xl bold</p>
            <p className="text-body-xl font-link underline">
              <a href="https://example.com">xl link</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
