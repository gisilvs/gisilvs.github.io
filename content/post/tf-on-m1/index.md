---
# Documentation: https://wowchemy.com/docs/managing-content/

title: "How to install TensorFlow and TensorFlow Probability (nightly) on Mac M1 Pro with Rosetta"
subtitle: ""
summary: "In this post, I will show how you can install tf-nightly and tfp-nightly on your Mac M1 Pro with Rosetta"
authors: [admin]
tags: []
categories: []
date: 2021-11-06T17:10:48+01:00
lastmod: 2021-11-06T17:10:48+01:00
featured: false
draft: false

# Featured image
# To use, add an image named `featured.jpg/png` to your page's folder.
# Focal points: Smart, Center, TopLeft, Top, TopRight, Left, Right, BottomLeft, Bottom, BottomRight.
image:
  caption: ""
  focal_point: ""
  preview_only: false

# Projects (optional).
#   Associate this post with one or more of your projects.
#   Simply enter your project's folder or file name without extension.
#   E.g. `projects = ["internal-project"]` references `content/project/deep-learning/index.md`.
#   Otherwise, set `projects = []`.
projects: []

---

## Introduction

If like me you recently upgraded to the latest MacBook Pro with M1 chip and use the nightly version of TensorFlow (TF) and TensorFlow Probability (TFP) in most of your research projects, then you'll probably find this page useful. I initially followed the [Apple's tutorial](https://developer.apple.com/metal/tensorflow-plugin/) to install TF 2.6 on M1, which worked smoothly and allows you to use M1's GPU. I could also install TFP with conda, but could not get the latest version which led to some conflicts. I quickly had to give up on using TF and TFP for M1 (if you figure out a way, please let me know!!).
A different strategy is to install python libraries for x86 using Rosetta 2. While this can be done easily for most python packages, it turned out to be quite tricky for TF and TFP. In fact, you can't just `pip install tf-nightly tfp-nightly`, as Rosetta 2 does not support the AVX instruction set.
In this post, I will guide you thorugh the procedure I used to get both `tf-nightly` and `tfp-nightly` to work on the M1 chip with Rosetta 2.

## Preliminaries

Before we start, you need to change the way the Terminal app is open, and set it to be with Rosetta. To do so, in `Applications/Utilities`, right click on `Terminal`, then `Get Info`, and check the box 'Open using Rosetta'. Make sure to close and reopen the terminal.

As first step, you need the Xcode Command Line Tools installed. You can do this by running:

```bash
xcode-select --install
```

Then, we need homebrew for x86. Simply install homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

and then rename it by copying the following line in the file `.zshrc`: `alias brow='/usr/local/bin/brew'`. In this way, you can use `brew` both on M1 (`brew`) and on x86 translated with Rosetta (`brow`).

Next step, we need to install miniconda and create an environment. Start with:

```bash
brow install --cask miniconda
```

Then, you need to run `conda init`. if you have previously installed miniforge, you need to remove from the file `.bash_profile` everything between (and including):

```bash
# >>> conda initialize >>>
...
# <<< conda initialize <<<
```

and then run `conda init` again.

Now, type `source activate .bash_profile`, and then `conda create -n env_name python=3.9`. After the environment is created, type `conda activate env_name`.

As last part of the preliminaries, we need to install `bazel`, which will allow us to compile TF from source. I actually followed a different route here, but do not know whether that's necessary or if simply installyng `bazel` with homebrew would be enough. What I did is explained [here](https://github.com/tensorflow/tensorflow/issues/46044#issuecomment-801349383), and consists of:

```bash
brow install zlib
brow install bzip2
brow install sqlite
brow install libiconv
brow install libzip
brow install xz
brow install bazelisk
brow install gnu-sed
```

## Install TensorFlow

For this part, I mostly followed the [instructions to build from source](https://www.tensorflow.org/install/source) with some minor modifications. Making sure that you are in the conda environment previously created (`env_name` in our example), type:

```bash
pip install -U pip numpy wheel
pip install -U keras_preprocessing --no-deps
```

Then, clone the TF git repo:

```bash
git clone https://github.com/tensorflow/tensorflow.git
cd tensorflow
```

If you need a specific version of tensorflow, for example 2.7, you can type `git checkout r2.7`. However, here I will show how to install the latest (nightly) version. To start the build, type:

```bash
./configure
bazel build //tensorflow/tools/pip_package:build_pip_package
```

This will take at least a couple of hours.

Once it's done, you can build the package with

```bash
./bazel-bin/tensorflow/tools/pip_package/build_pip_package --nightly_flag /tmp/tensorflow_pkg
```

After this, in the folder `tmp/tensorflow_pkg/`, you will find the `.whl` file. For example, it could be something like `tensorflow-2.6.0-cp38-cp38-macosx_10_11_x86_64.whl`, or in our case, something like `tf_nightly-2.8.0-cp39` and more stuff. Rename that file as `tf_nightly-2.8.0-py3-none-any.whl` or, in general, `tensorflow` or `tf_nightly` depending on the version you are using, followed by the version `-2.x.y` followed by `-py3-none-any.whl`.

Finally, run:

```bash
python -m pip install /tmp/tensorflow_pkg/tf_nightly-2.8.0-py3-none-any.whl
```
## Install TensorFlow Probability

For TFP, things are a bit easier (and faster), with only minor modifications from the [official website](https://www.tensorflow.org/probability/install).

The list of commands to run is:

```bash
  git clone https://github.com/tensorflow/probability.git
  cd probability
  bazel build --copt=-O3 --copt=-march=native :pip_pkg
  PKGDIR=$(mktemp -d)
  ./bazel-bin/pip_pkg $PKGDIR
  python -m pip install --upgrade $PKGDIR/*.whl
```

And we are done!


## Conclusions
This was the procedure I used to install TF and TFP on my Mac M1 with Rosetta. If you find better way to do that, or a way to install both nightly versions directly on M1, please reach out!
After all, who wouldn't like to train their models on GPU with a Mac?
