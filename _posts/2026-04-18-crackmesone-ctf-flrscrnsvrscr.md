---
title: "Crackmes.one CTF (FLRSCRNSVR.SCR)"
date: 2026-04-18
layout: single
classes: wide
---

# Intro
This crackme is part of the 2026 CTF and is classified as an easy one,I am a beginner so if i make some mistakes don't go too hard on me but hopefully we wont :) you can find everything about the crack me [Here](https://github.com/crackmesone/ctf-2026-challenges-public/tree/main/FLRSCRNSVR/)

# Preview

frogs..

![](/assets/images/crackmesone-ctf-flrscrnsvrscr-images-1776468422499_image.png){: width="100%"}

> Keep Calm and FLARE On

# Analysis

Loading the `FLRSCRNSVR.SCR` file in Ida will lead us into the WinMain which is the initial function for the windows GUI applications and it takes 4 parameters you can take a look at this structure
```cpp
int __clrcall WinMain(
  [in]           HINSTANCE hInstance,
  [in, optional] HINSTANCE hPrevInstance,
  [in]           LPSTR     lpCmdLine,
  [in]           int       nShowCmd
);
```

we need to put `lpCmdLine` in mind because after we just scroll few lines we find this interesting code 

![](/assets/images/crackmesone-ctf-flrscrnsvrscr-images-1776468002442_image.png){: width="100%"}

After one search we found this useful information about `.SCR` is that they have options that can be passed to the command Line:

- **/s** | **-s** Runs the screensaver in full-screen mode
- **/c** | **-c** Opens the configuration dialog box
- **/p** | **-p** Previews the screensaver within a small window
- **/a** | **-a** Changes password settings (this doesn't exist on our program)

We continue to read the decompiler code and we end up finding another function call `sub_140002950` that takes hInstance as a parameter going through it again we end up calling another function `sub_140003500` that looks like it has to do with rendering going through we find this intresting string

![](/assets/images/crackmesone-ctf-flrscrnsvrscr-images-1776468744116_image.png){: width="100%"}

when we run the program with the **/c** option we end up getting a MessageBox asking us for input

![](/assets/images/crackmesone-ctf-flrscrnsvrscr-images-1776469024339_image.png){: width="100%"}

the default string it contains is "Crackmes.one" nice we find another reference to the same string with the quote too

![](/assets/images/crackmesone-ctf-flrscrnsvrscr-images-1776469186160_image.png){: width="60%"}


we go back to WinMain and find another function `sub_140002BF0(hInstance, nShowCmd)` and it takes two parameters going through it we end up calling another function `sub_140001AE0(aCrackmesOne);` which we pass the wide string "Crackmes.one" now i found out that this function is so important because it does grabs the input from the configuration MessageBox located at `Computer\HKEY_CURRENT_USER\Software\FLRSCRNSVR`
![](/assets/images/crackmesone-ctf-flrscrnsvrscr-images-1776470352863_image.png){: width="100%"}
it has this Quak with some weird data? and our Text and it has value "test" which i entered to see anyways the program ends up counting our input length and exactly compares if its equal to 25

![image](/assets/images/crackmesone-ctf-flrscrnsvrscr-images-1776470489685_image.png){: width="85%"}

so i came up with this string "Crackmes.one.Crackmes.de." because im a dumb ass i don't know what else to think of also i noticed the value of quak doesn't change,after checking whether our input is equal to 25 or not we end up calling this function `sub_140001300(wchar_t * Input)` which takes our input as a parameter.

![](/assets/images/crackmesone-ctf-flrscrnsvrscr-images-1776470861176_image.png){: width="100%"}


interesting this function copies these strings to some destination and it counts our password length again and goes on a for loop,going through our input string, calling `wcschr(chunk_1,input[i])`
chunk_1 contains "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789}_{=-"
and if it finds a character it returns a pointer to that character in the list then proceeds to do
```cpp
input[i] = chunk_2[ptr - chunk_1.data()];
```
nice some its some kind of Substitution?, we don't know after that loops ends we move this string **"FLARERALF"** and again we loop through our input but this time doing this
```cpp
    LOWORD(v25) = Flare[j % FlareLength] + j;
    input[j] ^= v25;
```
The reason we we do LOWORD(v25) is because we are only loading a 16 bit value aka one character
just after that it does reverse our string so we know what the algorithm does:
- Uses a lookup table to encode characters
- Uses String "FLARERALF" as a xor key
- Reverses the whole encoded string
- the output can be transformed back to its original form

# Solving
on the next function `sub_140001890` we meet up with the Quak we open a registry key located at `Software\\FLRSCRNSVR` and copy an array of bytes to that registry key guess what :) thats our encrypted value that we need to apply the algorithm to in reverse in this case here is what we were able to consturct
```cpp

#include <algorithm>
#include <iostream>
#include <print>

wchar_t arr[] = {0x003c, 0x0051, 0x006a, 0x0009, 0x0002, 0x0007, 0x0025,
                 0x0003, 0x0030, 0x0008, 0x0004, 0x0029, 0x0068, 0x0024,
                 0x0001, 0x0024, 0x0018, 0x006b, 0x0077, 0x000f, 0x0070,
                 0x0036, 0x0002, 0x000e, 0x000b};
int main() {
  std::wstring chunk_1 =
      L"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789}_{=-";
  std::wstring chunk_2 =
      L"-={_}9876543210ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfedcba";
  std::wstring Flare = L"FLARERALF";
  std::wstring out;
  for (int i = 0; i < sizeof(arr) / sizeof(wchar_t); i++)
    out += arr[i];

  std::ranges::reverse(out);
  for (int i = 0; i < out.length(); i++) {
    wchar_t flare = Flare[i % Flare.length()] + i;
    out[i] ^= flare;
  }
  for (int i = 0; i < out.length(); i++) {
    auto ptr = wcschr(chunk_2.data(), out[i]);
    if (ptr)
      out[i] = chunk_1[ptr - chunk_2.data()];
  }
  std::wcout << out << std::endl;
}
```
andd the output iss **CMO{frogt4s7ic_r3vers1ng}** We got it NICEE!!


# Overview

This was a great practice crackme truly a master piece and hopefully we will crack the others when i feel like im better but right now i will continue just doing simple crackmes Have a great day!